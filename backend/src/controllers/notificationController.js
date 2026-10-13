const { Op } = require("sequelize");
const db = require("../../models");

const FILTERS = {
  all: {},
  unread: { isRead: false },
  read: { isRead: true },
  credit: { type: "credit" },
  debit: { type: "debit" },
  deposit: { type: "deposit" },
  withdrawal: { type: "withdrawal" },
  failed: { type: "failed" },
  reversal: { type: "reversal" },
  pin: { type: { [Op.in]: ["pin_created", "pin_changed"] } },
  security: { type: "security_alert" },
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const rawLimit = parseInt(query.limit, 10) || 20;
  const limit = Math.min(100, Math.max(1, rawLimit));
  return { page, limit, offset: (page - 1) * limit };
}

// GET /user/notifications — authenticated user's notifications only.
const listNotifications = async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const filterKey = String(req.query.filter || "all").toLowerCase();
  const filter = FILTERS[filterKey] || FILTERS.all;

  // Ownership: the user id always comes from the verified token, never the
  // client.
  const where = { ...filter, userId: req.user.id };

  const { rows, count } = await db.Notification.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  return res.status(200).json({
    status: "success",
    notifications: rows,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit) || 1,
      hasMore: offset + rows.length < count,
    },
  });
};

// GET /user/notifications/unread-count
const unreadCount = async (req, res) => {
  const count = await db.Notification.count({
    where: { userId: req.user.id, isRead: false },
  });

  return res.status(200).json({
    status: "success",
    unreadCount: count,
  });
};

// PATCH /user/notifications/:id/read
const markRead = async (req, res) => {
  const { id } = req.params;

  if (!UUID_PATTERN.test(String(id))) {
    return res.status(400).json({
      status: "error",
      message: "Invalid notification id",
    });
  }

  // Scoped by userId so a user can never mark another user's notification.
  const notification = await db.Notification.findOne({
    where: { id, userId: req.user.id },
  });

  if (!notification) {
    return res.status(404).json({
      status: "error",
      message: "Notification not found",
    });
  }

  if (!notification.isRead) {
    notification.isRead = true;
    await notification.save();
  }

  const unread = await db.Notification.count({
    where: { userId: req.user.id, isRead: false },
  });

  return res.status(200).json({
    status: "success",
    notification,
    unreadCount: count,
  });
};

// PATCH /user/notifications/read-all
const markAllRead = async (req, res) => {
  const [updated] = await db.Notification.update(
    { isRead: true },
    { where: { userId: req.user.id, isRead: false } }
  );

  return res.status(200).json({
    status: "success",
    updated,
    unreadCount: 0,
  });
};

module.exports = {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
};

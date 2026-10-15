const { z } = require('zod');

// Profile pictures are uploaded as base64 data URLs (the client converts the
// chosen file with FileReader before sending). Only common image formats are
// accepted, and the string is capped so a single request cannot store an
// unbounded blob in the database.
const DATA_URL_PATTERN = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

// ~1.4 MB of base64 is roughly 1 MB of decoded image data.
const MAX_AVATAR_LENGTH = 1_400_000;

const avatarUpdateValidation = z.object({
  avatar: z
    .string()
    .max(MAX_AVATAR_LENGTH, 'Image is too large. Please choose a photo under 1 MB.')
    .regex(DATA_URL_PATTERN, 'Avatar must be a PNG, JPEG or WebP image'),
});

const verifyPinValidation = z.object({
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
});

module.exports = { avatarUpdateValidation, verifyPinValidation };

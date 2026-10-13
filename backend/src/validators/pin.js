const { z } = require('zod');

const pin = z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits');

// Accepts the modern { currentPin, newPin, confirmPin } shape and the legacy
// { pin, newPin } shape.
const changePinValidation = z
  .object({
    currentPin: pin.optional(),
    pin: pin.optional(),
    newPin: pin,
    confirmPin: pin.optional(),
  })
  .refine((data) => data.currentPin !== undefined || data.pin !== undefined, {
    message: 'Current PIN is required',
    path: ['currentPin'],
  });

module.exports = { changePinValidation };

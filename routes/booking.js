const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const { isLoggedIn } = require("../middleware.js");
const bookingController = require("../controllers/booking.js");

router.post("/listings/:id/bookings", isLoggedIn, wrapAsync(bookingController.createBooking));
router.get("/bookings", isLoggedIn, wrapAsync(bookingController.index));
router.post("/bookings/:id/status", isLoggedIn, wrapAsync(bookingController.updateStatus));
router.patch("/bookings/:id/status", isLoggedIn, wrapAsync(bookingController.updateStatus));
router.delete("/bookings/:id", isLoggedIn, wrapAsync(bookingController.destroyBooking));

module.exports = router;

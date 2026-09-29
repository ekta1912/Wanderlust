const Booking = require("../models/booking.js");
const Listing = require("../models/listing.js");

module.exports.createBooking = async (req, res) => {
    const { id } = req.params;
    const listing = await Listing.findById(id);
    if (!listing) {
        req.flash("error", "Listing does not exist!");
        return res.redirect("/listings");
    }

    const { checkIn, checkOut } = req.body.booking || {};
    if (!checkIn || !checkOut) {
        req.flash("error", "Please provide both check-in and check-out dates.");
        return res.redirect(`/listings/${id}`);
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
        req.flash("error", "Invalid check-in or check-out date.");
        return res.redirect(`/listings/${id}`);
    }

    if (checkInDate < today) {
        req.flash("error", "Check-in date cannot be in the past.");
        return res.redirect(`/listings/${id}`);
    }

    if (checkOutDate <= checkInDate) {
        req.flash("error", "Check-out date must be after check-in date.");
        return res.redirect(`/listings/${id}`);
    }

    // Overlapping reservation / Double-Booking concurrency check
    // Only Pending and Accepted bookings block dates; Declined bookings do not
    const existingConflict = await Booking.findOne({
        listing: id,
        status: { $in: ["Pending", "Accepted"] },
        checkIn: { $lt: checkOutDate },
        checkOut: { $gt: checkInDate }
    });

    if (existingConflict) {
        req.flash("error", "This listing is already booked for the selected dates. Please choose different dates.");
        return res.redirect(`/listings/${id}`);
    }

    // Calculate total price based on number of nights
    const diffTime = checkOutDate.getTime() - checkInDate.getTime();
    const nights = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    const totalPrice = nights * (listing.price || 0);

    const newBooking = new Booking({
        listing: id,
        user: req.user._id,
        checkIn: checkInDate,
        checkOut: checkOutDate,
        totalPrice,
        status: "Pending"
    });

    await newBooking.save();
    req.flash("success", "Booking request sent to host! Status: Pending approval.");
    res.redirect("/bookings");
};

module.exports.index = async (req, res) => {
    // Bookings requested by the logged-in user
    const bookings = await Booking.find({ user: req.user._id })
        .populate("listing")
        .sort({ createdAt: -1 });

    // Bookings received for listings owned by the logged-in user
    const userListings = await Listing.find({ owner: req.user._id }).select("_id");
    const userListingIds = userListings.map(l => l._id);
    const receivedBookings = await Booking.find({ listing: { $in: userListingIds } })
        .populate("listing")
        .populate("user")
        .sort({ createdAt: -1 });

    res.render("bookings/index.ejs", { bookings, receivedBookings });
};

module.exports.updateStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!["Accepted", "Declined"].includes(status)) {
        req.flash("error", "Invalid booking status action.");
        return res.redirect("/bookings");
    }

    const booking = await Booking.findById(id).populate("listing");
    if (!booking) {
        req.flash("error", "Booking request not found.");
        return res.redirect("/bookings");
    }

    // Strict security check: only the owner of this specific listing can Accept or Decline
    if (!booking.listing || !booking.listing.owner.equals(req.user._id)) {
        req.flash("error", "You do not have permission to update this booking request.");
        return res.redirect("/bookings");
    }

    booking.status = status;
    await booking.save();

    req.flash("success", `Booking request has been ${status.toLowerCase()}!`);
    res.redirect("/bookings");
};

module.exports.destroyBooking = async (req, res) => {
    const { id } = req.params;
    const booking = await Booking.findById(id);

    if (!booking) {
        req.flash("error", "Booking not found.");
        return res.redirect("/bookings");
    }

    if (!booking.user.equals(req.user._id)) {
        req.flash("error", "You do not have permission to cancel this booking.");
        return res.redirect("/bookings");
    }

    await Booking.findByIdAndDelete(id);
    req.flash("success", "Booking cancelled successfully.");
    res.redirect("/bookings");
};

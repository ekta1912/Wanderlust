const { planTrip, getNearbyPlaces, isKeyConfigured } = require("../utils/gemini.js");

module.exports.renderAssistant = (req, res) => {
    const initialLocation = req.query.location || "";
    res.render("assistant/index.ejs", { initialLocation });
};

module.exports.planTrip = async (req, res) => {
    const { startLocation, destination, budget, days } = req.body || {};

    if (!startLocation || !destination) {
        return res.status(400).json({
            success: false,
            error: "Starting location and destination are required."
        });
    }

    try {
        const result = await planTrip({
            startLocation: startLocation.trim(),
            destination: destination.trim(),
            budget: budget ? budget.trim() : "",
            days: days ? parseInt(days) : 3
        });

        res.json({
            success: true,
            plan: result.plan,
            isLive: result.isLive
        });
    } catch (err) {
        console.error("[Assistant Error]", err);
        res.status(500).json({
            success: false,
            error: "Could not generate travel plan at this moment. Please try again."
        });
    }
};

module.exports.getNearby = async (req, res) => {
    const { location } = req.body || {};

    if (!location) {
        return res.status(400).json({
            success: false,
            error: "Location is required to find nearby places."
        });
    }

    try {
        const result = await getNearbyPlaces({
            location: location.trim()
        });

        res.json({
            success: true,
            plan: result.plan,
            isLive: result.isLive
        });
    } catch (err) {
        console.error("[Assistant Error]", err);
        res.status(500).json({
            success: false,
            error: "Could not fetch nearby recommendations at this moment. Please try again."
        });
    }
};

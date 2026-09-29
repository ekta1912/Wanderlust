const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const assistantController = require("../controllers/assistant.js");

router.get("/", assistantController.renderAssistant);
router.post("/plan", wrapAsync(assistantController.planTrip));
router.post("/nearby", wrapAsync(assistantController.getNearby));

module.exports = router;

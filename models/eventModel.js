const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
  name: { type: String, required: true },
  genre: { type: String, required: true },
  host: { type: String, required: true },
  image: { type: String, required: false }, // optional image
  description: { type: String, required: true },
  location: { type: String, required: true },
  date: { type: Date, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "log_reg_form" },
  slots: { type: Number, required: true },
  bookeduser: [{ type: mongoose.Schema.Types.ObjectId, ref: "log_reg_form" }],
  link: { type: String, required: true },
});

module.exports = mongoose.model("Event", eventSchema);

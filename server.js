require("dotenv").config(); // Load env variables

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const multer = require("multer");
const { Server } = require("socket.io");
const http = require("http");
const path = require("path");

const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const FormDataModel = require("./models/FormData");
const Event = require("./models/eventModel");
const Post = require("./models/createPostFormData");
const Instrument = require("./models/InstrumentModel");

const SECRET_KEY = "your_secret_key";

const app = express();
app.use(express.json());

// CORS
const corsOptions = {
  // origin: process.env.APPLICATION_URL,
  origin: "*",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
};
app.use(cors(corsOptions));

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI;

mongoose
  .connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected successfully!"))
  .catch((error) => console.error("MongoDB connection error:", error));

// Configure Multer storage and file naming
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Store images in the "uploads" folder
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = Date.now() + ext; // Append timestamp to avoid name collision
    cb(null, filename);
  },
});

// Multer file filter to accept only images
const fileFilter = (req, file, cb) => {
  const fileTypes = /jpeg|jpg|png|gif/;
  const mimeType = fileTypes.test(file.mimetype);
  const extName = fileTypes.test(path.extname(file.originalname).toLowerCase());
  if (mimeType && extName) {
    return cb(null, true);
  } else {
    return cb(new Error("Only image files are allowed!"), false);
  }
};

// Multer upload configuration
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB size limit
  },
});

app.use(express.json());
app.use(cors());
app.use("/uploads", express.static("uploads")); // Serve uploaded files statically

// Create HTTP server
const server = http.createServer(app);

// Create Socket.IO server
const io = new Server(server, {
  cors: {
    origin: "*", // Frontend origin
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});

// Optional: log connections
io.on("connection", (socket) => {
  console.log("Client connected");

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

// Make `io` accessible in routes
app.set("io", io);

// -------------------------------------------------

app.get("/event/:id/booked-users", async (req, res) => {
  try {
    const eventId = req.params.id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID",
      });
    }

    // Fetch event and populate bookeduser array with selected fields
    const event = await Event.findById(eventId).populate({
      path: "bookeduser",
      select: "firstName lastName email phone",
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // bookeduser will be an array of user objects
    res.status(200).json({
      success: true,
      bookedUsers: event.bookeduser,
    });
  } catch (error) {
    console.error("Error fetching booked users:", error);
    res.status(500).json({
      success: false,
      message: `Server error: ${error.message}`,
    });
  }
});
// -------------------------------------------------

// Register User
app.post("/register", async (req, res) => {
  try {
    const {
      role,
      firstName,
      lastName,
      email,
      password,
      phone,
      address,
      country,
      state,
      description,
    } = req.body;

    const existingUser = await FormDataModel.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new FormDataModel({
      userId: new mongoose.Types.ObjectId().toString(),
      role,
      firstName,
      lastName,
      email,
      password: hashedPassword,
      phone,
      address,
      country,
      state,
      description: role === "Artist" ? description : "",
    });

    await newUser.save();
    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Login User
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await FormDataModel.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign({ userId: user.userId }, SECRET_KEY, {
      expiresIn: "1h",
    });

    res.json({ token });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/usernames", async (req, res) => {
  try {
    // Fetch all users and extract only firstName and lastName (or combine them as a full name)
    const users = await FormDataModel.find().select("firstName lastName");

    if (!users || users.length === 0) {
      return res.status(404).json({ message: "No users found" });
    }

    // Map the users to an array of full names
    const usernames = users.map((user) => `${user.firstName} ${user.lastName}`);

    res.json(usernames);
  } catch (error) {
    console.error("Error fetching usernames:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Update User Info
app.put("/user", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    const decoded = jwt.verify(token, SECRET_KEY);
    const userId = decoded.userId;

    const {
      firstName,
      lastName,
      email,
      password,
      country,
      state,
      description,
    } = req.body;

    const updateData = {
      firstName,
      lastName,
      email,
      country,
      state,
      description,
    };

    // Hash password if it's being changed
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updatedUser = await FormDataModel.findOneAndUpdate(
      { userId },
      updateData,
      { new: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "Profile updated", user: updatedUser });
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/addevent", upload.single("image"), async (req, res) => {
  try {
    const {
      name,
      genre,
      host,
      date,
      description,
      location,
      userId,
      slots,
      link,
      bookeduser = [], // Default to an empty array if not provided
    } = req.body;

    // Validate required fields
    if (
      !name ||
      !genre ||
      !host ||
      !date ||
      !description ||
      !location ||
      !userId ||
      !slots ||
      !link
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    // Create the event object
    const newEvent = new Event({
      name,
      genre,
      host,
      date,
      description,
      location,
      userId,
      slots,
      bookeduser,
      link,
      image: req.file ? req.file.filename : null, // Handle the image upload
    });

    // Save the new event to the database
    await newEvent.save();
    res.status(201).json({ success: true, event: newEvent });
  } catch (error) {
    console.error("Error adding event:", error);
    res.status(500).json({ success: false, message: "Failed to add event" });
  }
});

// GET /eventsdata - Fetch all events
// Fetch all events with populated userId and bookeduser references
app.get("/eventsdata", async (req, res) => {
  try {
    // Fetch all events and populate the userId and bookeduser fields
    const events = await Event.find(); // populate bookeduser (e.g., name, email)

    if (!events || events.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No events found" });
    }

    // Send back the events data
    res.status(200).json({ success: true, events });
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({
      success: false,
      message: `Failed to fetch events: ${error.message}`,
    });
  }
});

// =========================================================================================================================

// Get a single event by ID
app.get("/eventsdata/:id", async (req, res) => {
  try {
    const eventId = req.params.id;

    // Find event by ID
    const event = await Event.findById(eventId); // You can also populate fields if needed

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    res.status(200).json({
      success: true,
      event,
    });
  } catch (error) {
    console.error("Error fetching event:", error);
    res.status(500).json({
      success: false,
      message: `Failed to fetch event: ${error.message}`,
    });
  }
});

// RSVP to an event
app.post("/eventsdata/:id/rsvp", async (req, res) => {
  const eventId = req.params.id;
  const { userId } = req.body;

  try {
    const event = await Event.findById(eventId);

    if (!event) {
      return res
        .status(404)
        .json({ success: false, message: "Event not found" });
    }

    // Check if user already RSVP'd
    if (event.bookeduser.includes(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "User already RSVP'd" });
    }

    event.bookeduser.push(userId);
    await event.save();

    res.status(200).json({ success: true, message: "RSVP successful", event });
  } catch (error) {
    console.error("Error RSVPing:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get Logged-in User Info
app.get("/user", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    const decoded = jwt.verify(token, SECRET_KEY);
    const user = await FormDataModel.findOne({ userId: decoded.userId }).select(
      "-password"
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Create Post with Socket.IO emit
app.post("/posts", async (req, res) => {
  const { token, message } = req.body;

  if (!token || !message) {
    return res.status(400).json({ message: "Token and message are required" });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const user = await FormDataModel.findOne({ userId: decoded.userId });
    if (!user) return res.status(404).json({ message: "User not found" });

    const newPost = new Post({
      userId: user.userId,
      userName: `${user.firstName} ${user.lastName}`,
      message,
    });

    await newPost.save();

    // Emit new post to all connected clients
    const io = req.app.get("io");
    io.emit("newPost", newPost);

    res.status(201).json({ post: newPost });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Get All Posts
app.get("/posts", async (req, res) => {
  try {
    const posts = await Post.find().sort({ dateTime: -1 });
    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Like/Unlike a post
app.put("/posts/like/:id", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const userId = decoded.userId;

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const alreadyLiked = post.likedUsers.some((id) => id.toString() === userId);

    if (alreadyLiked) {
      // Unlike
      post.likedUsers = post.likedUsers.filter(
        (id) => id.toString() !== userId
      );
    } else {
      // Like
      post.likedUsers.push(userId);
    }

    await post.save();

    // Emit the updated post to clients
    const io = req.app.get("io");
    io.emit("updatePost", post);

    res.json({ post });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Delete Post
app.delete("/posts/:id", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const userId = decoded.userId;

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    if (post.userId.toString() !== userId) {
      return res.status(403).json({ message: "You cannot delete this post" });
    }

    await Post.findByIdAndDelete(post._id);

    // Emit the post deletion event with the post ID
    const io = req.app.get("io");
    io.emit("deletePost", post._id);

    res.status(200).json({ message: "Post deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/addnewinstrument", upload.single("image"), async (req, res) => {
  try {
    const {
      instrumentName,
      instrumentDescription,
      amount,
      userId,
      userName,
      address,
      contactNumber,
      status,
      rentedDate,
      expectedReturnDate,
      renterId,
      category, // New field
    } = req.body;

    const newInstrument = new Instrument({
      instrumentName,
      instrumentDescription,
      amount,
      image: req.file ? req.file.filename : "",
      userId,
      userName,
      address,
      contactNumber,
      status,
      rentedDate,
      expectedReturnDate,
      renterId,
      category, // Save category
    });

    await newInstrument.save();
    res.status(201).json({ message: "Instrument added successfully!" });
  } catch (err) {
    res.status(500).json({ error: "Failed to add instrument" });
  }
});

app.get("/instruments", async (req, res) => {
  try {
    const instruments = await Instrument.find();
    res.status(200).json(instruments);
  } catch (error) {
    console.error("Error fetching instruments:", error);
    res.status(500).json({ error: "Unable to fetch instruments." });
  }
});

// Get a specific instrument by ID
app.get("/instruments/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const instrument = await Instrument.findById(id);

    if (!instrument) {
      return res.status(404).json({ error: "Instrument not found" });
    }

    res.status(200).json(instrument);
  } catch (error) {
    console.error("Error fetching instrument by ID:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/instruments/rent/:id", async (req, res) => {
  const { rentedDate, expectedReturnDate } = req.body;
  const instrumentId = req.params.id;

  try {
    // Extract token from the Authorization header
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Verify the token and extract user information
    const decoded = jwt.verify(token, SECRET_KEY);
    const renterId = decoded.userId; // Get the user ID from the decoded token

    // Find the instrument by ID
    const instrument = await Instrument.findById(instrumentId);
    if (!instrument) {
      return res.status(404).json({ message: "Instrument not found." });
    }

    // Check if the logged-in user is the owner of the instrument
    if (instrument.userId === renterId) {
      return res
        .status(400)
        .json({ message: "You cannot rent your own instrument." });
    }

    // Check if the instrument is available for rent
    if (instrument.status !== "available") {
      return res
        .status(400)
        .json({ message: "Instrument is not available for rent." });
    }

    // Update the instrument status to 'not available' and set rental details
    instrument.status = "not available";
    instrument.rentedDate = rentedDate;
    instrument.expectedReturnDate = expectedReturnDate;
    instrument.renterId = renterId;

    // Save the changes to the instrument
    await instrument.save();

    // Send the success response
    res
      .status(200)
      .json({ message: "Instrument rented successfully!", instrument });
  } catch (error) {
    console.error("Error renting instrument:", error);
    res.status(500).json({ error: "Unable to rent the instrument." });
  }
});

// Update instrument status to available and reset rented details
app.put("/instruments/return/:id", async (req, res) => {
  const instrumentId = req.params.id;

  try {
    // Extract token from the Authorization header
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Verify the token and extract user information
    const decoded = jwt.verify(token, SECRET_KEY);
    const userId = decoded.userId; // Get the user ID from the decoded token

    // Find the instrument by ID
    const instrument = await Instrument.findById(instrumentId);
    if (!instrument) {
      return res.status(404).json({ message: "Instrument not found." });
    }

    // Check if the logged-in user is the renter of the instrument
    if (instrument.renterId !== userId) {
      return res
        .status(400)
        .json({ message: "You are not the renter of this instrument." });
    }

    // Reset rented details and update status to "available"
    instrument.status = "available";
    instrument.rentedDate = "";
    instrument.expectedReturnDate = "";
    instrument.renterId = "";

    // Save the changes to the instrument
    await instrument.save();

    // Send the success response
    res.status(200).json({
      message: "Instrument returned and status updated to available!",
      instrument,
    });
  } catch (error) {
    console.error("Error updating instrument status:", error);
    res.status(500).json({ error: "Unable to return the instrument." });
  }
});

// Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

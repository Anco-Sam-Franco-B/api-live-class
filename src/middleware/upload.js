const multer = require("multer");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const AppError = require("../utils/AppError");
const env = require("../config/env");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let subfolder = "general";
    if (file.mimetype.startsWith("image")) subfolder = "images";
    else if (file.mimetype.startsWith("video")) subfolder = "videos";
    else if (file.mimetype === "application/pdf") subfolder = "pdfs";
    else if (file.mimetype.includes("zip") || file.mimetype.includes("rar")) subfolder = "archives";

    const uploadPath = path.join(__dirname, "..", env.UPLOAD_DIR, subfolder);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/svg+xml",
    "video/mp4",
    "video/webm",
    "video/avi",
    "video/quicktime",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/zip",
    "application/x-rar-compressed",
    "text/plain",
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError("File type not allowed", 400), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.MAX_FILE_SIZE },
});

module.exports = upload;

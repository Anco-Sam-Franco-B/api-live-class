const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  if (err.name === "ValidationError") {
    statusCode = 400;
    message = err.errors?.map((e) => e.msg).join(", ") || message;
  }

  if (err.code === "23505") {
    statusCode = 409;
    message = "Resource already exists";
  }

  if (err.code === "23503") {
    statusCode = 400;
    message = "Referenced resource not found";
  }

  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token";
  }

  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token expired";
  }

  if (err.code === "LIMIT_FILE_SIZE") {
    statusCode = 400;
    message = "File too large";
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

module.exports = errorHandler;

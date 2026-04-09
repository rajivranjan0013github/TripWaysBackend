export const errorHandler = (err, req, res, next) => {
    // Log full error with request context for debugging
    console.error(`❌ [${req.method} ${req.originalUrl}]`, err);

    // Determine appropriate status code
    const statusCode = err.statusCode || err.status || 500;

    // Sanitize error message: only expose safe messages to clients
    const isServerError = statusCode >= 500;
    const clientMessage = isServerError
        ? "An internal server error occurred. Please try again."
        : err.message;

    res.status(statusCode).json({ error: clientMessage });
};

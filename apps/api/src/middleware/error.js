export function notFound(_request, response) {
  return response.status(404).json({ error: "Route not found." });
}

export function errorHandler(error, _request, response, _next) {
  const status = error.status || 500;
  return response.status(status).json({
    error: error.message || "Unexpected server error."
  });
}


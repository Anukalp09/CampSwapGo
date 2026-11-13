// Create an error with an HTTP status code. The error handler turns it into a JSON response.
export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

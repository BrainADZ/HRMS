// Bind first, then report the actual port. Port 0 lets the OS choose a free port.
export async function listenAvailable(app, { port = 3000, host = '0.0.0.0' } = {}) {
  const bind = (requested) => new Promise((resolve, reject) => {
    const server = app.listen(requested, host);
    server.once('error', reject);
    server.once('listening', () => resolve(server));
  });
  try {
    return await bind(port);
  } catch (error) {
    if (error.code !== 'EADDRINUSE' || port === 0) throw error;
    return bind(0);
  }
}

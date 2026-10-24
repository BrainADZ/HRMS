// Short application writes share a lock for cross-module invariants.
// File parsing and external AI requests stay outside this transaction.
import { sessionMiddleware } from '../auth.js';
import { fail } from '../core.js';
export async function workflow(db, fn) {
  return db.tx(async () => {
    await db.run('SELECT pg_advisory_xact_lock(?)', 7264182030);
    return fn();
  });
}

export function atomicRouter(router, db, onClose) {
  const pending = new Set();
  onClose?.(() => Promise.allSettled([...pending]));
  const track = (handler) => (req, res, next) => {
    const task = Promise.resolve().then(() => handler(req, res, next));
    pending.add(task);
    task.then(
      () => pending.delete(task),
      () => pending.delete(task),
    );
    return task;
  };
  return new Proxy(router, {
    get(target, method) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
        const value = Reflect.get(target, method);
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return (path, ...handlers) => {
        if (method === 'get' || path.endsWith('/ask') || path === '/auth/password-reset-request') {
          const handler = handlers.pop();
          return target[method](path, ...handlers, track(handler));
        }
        const handler = handlers.pop();
        handlers.push(
          track(async (req, res, next) => {
            const original = { json: res.json, send: res.send, end: res.end };
            let reply;
            for (const key of Object.keys(original))
              res[key] = function (...args) {
                reply = () => original[key].apply(res, args);
                return res;
              };
            try {
              await workflow(db, async () => {
                if (req.user) {
                  req.user = null;
                  await sessionMiddleware(db)(req, res, () => {});
                  if (!req.user) fail(401, 'Please sign in');
                  if (req.user.mustChangePassword && !path.startsWith('/auth/'))
                    fail(403, 'Change your temporary password before continuing');
                }
                return handler(req, res, next);
              });
            } catch (error) {
              res.removeHeader?.('Set-Cookie');
              throw error;
            } finally {
              Object.assign(res, original);
            }
            if (reply) reply();
          }),
        );
        return target[method](path, ...handlers);
      };
    },
  });
}

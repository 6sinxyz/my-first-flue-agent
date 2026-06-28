import { flue } from '@flue/runtime/routing';
import { Hono, type MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { STREAMING_LAB_HTML } from './frontend.generated.js';

type Bindings = {
  FLUE_API_TOKEN?: string;
};

const AUTH_ERROR = { error: 'unauthorized' };

const requireBearerToken: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  if (c.req.method === 'OPTIONS') {
    return next();
  }

  const expectedToken = c.env.FLUE_API_TOKEN;
  const authorization = c.req.header('authorization');
  const suppliedToken = parseBearerToken(authorization);

  if (!expectedToken || !suppliedToken || !(await tokensEqual(suppliedToken, expectedToken))) {
    return c.json(AUTH_ERROR, 401);
  }

  await next();
};

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  '*',
  cors({
    origin: '*',
    allowHeaders: ['Authorization', 'Content-Type', 'Accept'],
    allowMethods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
    maxAge: 86400,
  }),
);


app.get('/lab', (c) => {
  c.header('cache-control', 'no-store');
  return c.html(STREAMING_LAB_HTML);
});

app.use('/agents/*', requireBearerToken);
app.use('/workflows/*', requireBearerToken);
app.use('/runs/*', requireBearerToken);
app.use('/channels/*', requireBearerToken);
app.route('/', flue());

function parseBearerToken(authorization: string | undefined): string | undefined {
  if (!authorization) {
    return undefined;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1];
}

async function tokensEqual(suppliedToken: string, expectedToken: string): Promise<boolean> {
  const [suppliedHash, expectedHash] = await Promise.all([
    sha256(suppliedToken),
    sha256(expectedToken),
  ]);

  if (suppliedHash.byteLength !== expectedHash.byteLength) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < suppliedHash.byteLength; index += 1) {
    diff |= suppliedHash[index] ^ expectedHash[index];
  }

  return diff === 0;
}

async function sha256(value: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(digest);
}

export default app;

import Fastify from 'fastify';

const server = Fastify({ logger: true });

server.get('/api/health', async () => {
  return { status: 'ok', service: 'eloc2-api', version: '0.1.0' };
});

const start = async () => {
  try {
    await server.listen({ port: 3001, host: '0.0.0.0' });
    console.log('ELOC2 API server running on http://localhost:3001');
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();

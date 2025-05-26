const Redis = require('ioredis');

const subscriber = new Redis({
  host: 'redis',
  port: 6379
});

subscriber.psubscribe('status*', (err, count) => {
  if (err) {
    console.error('Failed to subscribe: ', err);
  } else {
    console.log(`Subscribed to ${count} channel(s).`);
  }
});

subscriber.on('pmessage', (pattern, channel, message) => {
  console.log(`[${channel}] ${message}`);
});

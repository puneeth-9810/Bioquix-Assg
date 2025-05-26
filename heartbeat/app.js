const axios = require('axios');
const Redis = require('ioredis');
require('dotenv').config();

const redis = new Redis({
  host: 'redis',
  port: 6379
});


const checkHealth = async () => {
  try {
    const res = await axios.get('http://api_proxy:5000/health', { timeout: 5000 });
    redis.publish('status from heartbeat' , 'API Proxy is healthy');
  } catch (err) {
    redis.publish('status from heartbeat' , 'cannot ping the API Proxy!');
    console.error('API Proxy failed');
  }
};

setInterval(checkHealth, 5000);
const express = require('express');
const axios = require('axios');
const Redis = require('ioredis');
const CB = require('opossum');
require('dotenv').config();

const app = express();
const redis = new Redis({
  host: 'redis',
  port: 6379
});


const boptions = {
  errorThresholdPercentage: 50,
  resetTimeout: 15000,
};

  let OMDB_s= 1;
  let TVMAZE_s=1;


const fetch = async (url, api, tries = 2) => {
  let attempt = 0;
  while (attempt <= tries) {
    try {
      const response = await axios.get(url, { timeout: 5000 });
      return response.data;
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        if (status === 429) {
          await redis.publish('status from API proxy' , `${api} - rate limit error (HTTP 429)`);
          throw new Error('error 1');
        }
        if (status === 401 || status === 403) {
          await redis.publish('status from API proxy' , `${api} - permanent error (invalid API key)`);
          throw new Error('error 3');
        }
      }
      if (error.code === 'ECONNABORTED') {
        await redis.publish('status from API proxy' , `${api} - timeout (>5s)`);
        if (attempt < tries) {
          attempt++;
          await redis.publish('status from API proxy' , `${api} - retrying`);
          continue; 
        } else {
          throw new Error('error 2');
        }
      }
      await redis.publish('status from API proxy' , `${api} - ${error.message}`);
      throw new Error('error');
    }
  }
};


const ccb = (url, api) => {
  return new CB(() => fetch(url, api), boptions);
};

app.get('/data', async (req, res) => {
  const title = req.query.title || "INCEPTION";
  if (!title) return res.status(400).json({ error: 'tittle is missing' });

  const OMDB_key="bafc5590";
  const OMDB = `https://www.omdbapi.com/?apikey=${OMDB_key}&t=${encodeURIComponent(title)}`;
  const TVMAZE = `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(title)}`;

  if (OMDB_s !== 1 && TVMAZE_s !== 1) {
    await redis.publish('status from API proxy' , 'both APIs are inactive');
    return res.json({ warning: 'both APIs inactive', data: null });
  }

  const breaker1 = ccb(OMDB, 'OMDB');
  const breaker2 = ccb(TVMAZE, 'TVMAZE');

  if (OMDB_s === 1) {
    try {
      const data = await breaker1.fire();
      await redis.publish('status from API proxy' , 'getting info from OMDB API');
      return res.json({ source: 'OMDB-API', data });
    } catch (err1) {
      await redis.publish('status from API proxy' , 'OMDB API failed - ' + err1.message);
      if (err1.message === 'error 3') {
        OMDB_s = 0;
        await redis.publish('status from API proxy' , 'OMDB API marked inactive due to permanent failure');
      }
    }
  }

  if (TVMAZE_s === 1) {
    try {
      const data = await breaker2.fire();
      await redis.publish('status from API proxy' , 'getting info from TVMAZE API');
      return res.json({ source: 'TVMAZE-API', data });
    } catch (err2) {
      await redis.publish('status from API proxy' , 'TVMAZE API failed - ' + err2.message);
      if (err2.message === 'error 3') {
        TVMAZE_s = 0;
        await redis.publish('status from API proxy' , 'TVMAZE API marked inactive due to permanent failure');
      }
    }
  }

  await redis.publish('status from API proxy' , 'both APIs failed or inactive');
  return res.json({
    warning: 'both APIs failed or inactive',
    data: null,
  });
});

app.get('/health', (req, res) => res.sendStatus(200));

const PORT =  5000;
app.listen(PORT, () => console.log(`This is running on port ${PORT}`));

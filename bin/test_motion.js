const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
app.use(express.json());

const BASE_DIR = "C:/Simon/CamHub/src/node-home-nvr/data/test";

app.post('/get_clip', (req, res) => {
   const { camera, date, time } = req.body;
   const filePath = path.join(BASE_DIR, camera, date, `${date}-${time}-120.mp4`);
   console.log('Serving clip:', filePath);

   if (!fs.existsSync(filePath)) {
      return res.status(404).send('Clip not found');
   }
   res.setHeader('Content-Type', 'video/mp4');
   fs.createReadStream(filePath).pipe(res);
});

app.get('/videos/:cameraName/:date/:filename', async (req, res) => {
    const { cameraName, date, filename } = req.params;
    const filePath = path.join(BASE_DIR, cameraName, date, filename);
    console.log('Serving clip:', filePath);

   if (!fs.existsSync(filePath)) {
      return res.status(404).send('Clip not found');
   }
   res.setHeader('Content-Type', 'video/mp4');
   fs.createReadStream(filePath).pipe(res);
});

app.listen(6060, () => console.log('Node.js clip server running on port 6060'));

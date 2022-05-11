const express = require('express');
const cors= require('cors');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 5000;

//midleware
app.use(cors());
app.use(express.json());













// GET method route
app.get('/', (req, res) => {
    res.send('GET request to the homepage')
  })
  

  app.listen(port, () => {
    console.log('POST request to the homepage')
  })
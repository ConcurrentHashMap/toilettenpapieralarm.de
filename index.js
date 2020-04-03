const Helpers = require('./helpers');
const config = require('dotenv').config()
const express = require('express');
const Server = express();
const path = require('path');
const ejs = require('ejs');
const cors = require('cors');
const cheerio = require('cheerio');
const axios = require('axios');
const Sequelize = require('sequelize');
const Webscraper = require('./workers/webscraper')(Helpers, axios, cheerio);
const { setIntervalAsync, clearIntervalAsync } = require('set-interval-async/dynamic')

// Don't set this in production!
const forceDatabaseSync = process.env.FORCE_DATABASE_SYNC === 'true' || false;

/**
 * Use Sequelize to access Postgres
 */
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  protocol: 'postgres'
});

sequelize
  .authenticate()
  .then(() => {
    console.log('Connection to the database has been established successfully.');
  })
  .catch(err => {
    console.error('Unable to connect to the database:', err);
  });

/**
 * Sync models with database
 */
const Product = require('./models/product')(sequelize, Sequelize.DataTypes);
Product
    .sync({force: forceDatabaseSync === true ? true : false})
    .then(res => {
      console.log('Database syncronization completed.');
      if(forceDatabaseSync === true) {
        console.log('Populating database...');

        var a = Product.build({
          productId: 'B07XRWZBJ9',
          shop: 'Amazon.de',
          url: 'http://www.amazon.de/dp/B07XRWZBJ9',
          partnerUrl: 'https://amzn.to/3dTnfqM',
          isEnabled: true,
          forceUpdate: true
        });
        a.save();

      }
    })

/**
 * Run Webscraper as async setInterval
 */
setIntervalAsync(
  async () => { 
    var products = await Webscraper.run(Product);
    console.log(products);
  },
  1000*30 // every 30 seconds
);

/**
 * Function for querying the database for current availability of our products
 */
async function getAvailability() {
  var availability = {
    available: false,
    products: []
  };

  let promise = Product.findAll({
    where: {
      isAvailable: true
    },
    order: [['price', 'ASC']]
  }).then(products => {
      if(products.length > 0) {
        availability.products = products;
        availability.available = true;
      }
      return availability;
  }).catch(err => {
    return availability;
  });

  let result = await promise;
  return result;
}

/**
 * Express HTTP Server configuration
 */

Server.use(cors());
Server.set('view engine', 'html');
Server.engine('html', ejs.renderFile);

/** 
 * Redirect from http to https 
 * */
Server.get('*', function(req, res, next) {
  if(req.headers['x-forwarded-proto'] != 'https' && process.env.NODE_ENV === 'production')
    res.redirect('https://' + req.headers.host + req.url);
  else
    next(); // Continue to other routes if we're not redirecting
});

/**
 * Core application 
 */
Server.get('/', function(req, res) {
  getAvailability().then(availability => {
    res.render('index', {
      availability: availability
    });
  });
});

/**
 * API
 */
Server.get('/availability', function (req, res) {
  getAvailability().then(availability => res.status(200).json(availability));
});

/**
 * Legal standard stuff
 */
Server.get('/impressum', function(req, res) {
  res.render('impressum', {
    address_line_1: process.env.ADDRESS_LINE_1,
    address_line_2: process.env.ADDRESS_LINE_2,
    address_line_3: process.env.ADDRESS_LINE_3,
    address_line_4: process.env.ADDRESS_LINE_4,
    address_line_5: process.env.ADDRESS_LINE_5
  });
});

Server.get('/datenschutz', function(req, res) {
  res.render('datenschutz', {
    address_line_1: process.env.ADDRESS_LINE_1,
    address_line_2: process.env.ADDRESS_LINE_2,
    address_line_3: process.env.ADDRESS_LINE_3,
  });
});

Server.use(express.static(path.join(__dirname, 'public')));

var port = process.env.PORT || 5000;
Server.listen(port, function () {
    console.log('Server is up and running at port ' + port);
});
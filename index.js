require('dotenv').config()

const express = require('express');
const Server = express();
const path = require('path');
const ejs = require('ejs');
const cors = require('cors');
const Promise = require('promise');
const mailgun = require('mailgun-js')({apiKey: process.env.MAILGUN_API_KEY, domain: process.env.MAILGUN_DOMAIN});

const Xray = require('x-ray');
const x = Xray({
    filters: {
      trim: function(value) {
        return typeof value === 'string' ? value.trim() : value;
      },
      price: function(value) {
        return value ? parseFloat(value.substring(0, value.indexOf('€')-1).replace(/,/, '.')) : null;
      } 
    }
});

function sortByPrice(a, b) {
  if (a.price < b.price) return -1;
  if (a.price > b.price) return 1;
  return 0;
}

const { Client } = require('pg');
const client = new Client({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:pg@localhost:5432/dev"
});

client.connect()
.then(() => {
    console.log('Connected to Heroku Postgres')
    console.log('Creating table, if not exists...')
    client.query(`CREATE TABLE IF NOT EXISTS products (
      id INT NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      inserted TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      productid VARCHAR NOT NULL UNIQUE,
      title VARCHAR,
      merchant VARCHAR,
      availability VARCHAR,
      url VARCHAR,
      price NUMERIC
  );`)
    .then(res => {
        console.log('Done!');
    })
    .catch(err => console.error('Error while creating table', err.stack))
})
.catch(err => console.error('Connection error with Heroku Postgres', err.stack))

var notify = true;

/**
 * Web scraping
 */
var schedule = require('node-schedule');
var j = schedule.scheduleJob('*/1 * * * *', function() {
  var products = [];

  var query = `
  SELECT productid, updated, url FROM products;
`
  client.query(query)
  .then(pgres => {
    if(pgres.rows.length > 0) {
      products = pgres.rows;

      // Check if renew needed
      products = products.filter(product => {
        var currentDate = Date.now();
        var diff = (currentDate - product.updated.getTime()) / 1000 / 60;
        if(diff > 5) {
          return true;
        }
        return false;
      });

      if(products.length > 0) {
        [...new Set(products)].forEach(product => {     
          x(product.url, 'html', [
            {
              title: '#title | trim',
              availability: '#availability span | trim',
              price: '#priceblock_ourprice | price'
          }
          ]).then(function(result) {
            result = result[0] ? result[0] : null;
            if(result) {
              var query = `
                UPDATE products SET title = $1, updated = now(), availability = $2, price = $3 WHERE productid = $4 RETURNING *;
              `
              client.query(query, [result.title, result.availability, result.price, product.productid])
              .then(pgres => {
                // Nothing to do here...
              })
              .catch(err => {
                console.log('Error while saving', err)
              });
            }
          });
        });
      }
    }
  }).catch(err => {
    console.log('Error while fetching products from database', err)
  });

  if(notify)  {
    getAvailability().then(availability => {
      // E-Mail notification if there is any toilet paper available
      const data = {
        from: 'Toilettenpapieralarm.de <alarm@toilettenpapieralarm.de>',
        to: 'info@toilettenpapieralarm.de', // For my testing only
        subject: '🧻🔥 Alarm! Es ist Toilettenpapier verfügbar!',
        text: `${availability.products[0].title} ist bei ${availability.products[0].merchant} für ${availability.products[0].price.replace(/\./, ',')} € verfügbar. Link: ${availability.products[0].url}
        
--
Von Benachrichtigungen abmelden: https://toilettenpapieralarm.de/disable-notification`
      };
      mailgun.messages().send(data, function (error, body) {
        data.text;
        console.log(body);
      });
    });
  }
});

function getAvailability() {
  return new Promise(function(fulfill, reject) {
    var availability = {
      available: false,
      products: []
    };
  
    var query = `
      SELECT productid, title, merchant, availability, url, price FROM products;
    `
    client.query(query)
    .then(pgres => {
      if(pgres.rows.length > 0) {
        var filtered = pgres.rows.filter(result => result.availability && result.availability.toLowerCase().includes('auf lager') && !result.availability.toLowerCase().includes("nicht"));
        availability.products = filtered.sort(sortByPrice)
      }
      if(availability.products.length > 0) {
        availability.available = true;
      }
      fulfill(availability);
    })
    .catch(err => {
      console.log('Error while fetching products from database', err)
      reject(availability);
    });
  });
}

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

Server.get('/availability', function (req, res) {
  getAvailability().then(availability => res.status(200).json(availability));
});

Server.get('/enable-notification', function (req, res) {
  notify = true;
  res.status(200).send('OK');
});

Server.get('/disable-notification', function (req, res) {
  notify = false;
  res.status(200).send('OK');
});

Server.get('/', function(req, res) {
  getAvailability().then(availability => {
    res.render('index', {
      availability: availability
    });
  });
});


Server.get('/datenschutz', function(req, res) {
  getAvailability().then(availability => {
    res.render('datenschutz', {
      address_line_1: process.env.ADDRESS_LINE_1,
      address_line_2: process.env.ADDRESS_LINE_2,
      address_line_3: process.env.ADDRESS_LINE_3,
    });
  });
});


Server.get('/impressum', function(req, res) {
  getAvailability().then(availability => {
    res.render('impressum', {
      address_line_1: process.env.ADDRESS_LINE_1,
      address_line_2: process.env.ADDRESS_LINE_2,
      address_line_3: process.env.ADDRESS_LINE_3,
      address_line_4: process.env.ADDRESS_LINE_4,
      address_line_5: process.env.ADDRESS_LINE_5
    });
  });
});

Server.use(express.static(path.join(__dirname, 'public')));

var port = process.env.PORT || 5000;
Server.listen(port, function () {
    console.log('Server is up and running at port ' + port);
});
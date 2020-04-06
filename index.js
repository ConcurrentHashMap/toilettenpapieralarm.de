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
const Op = Sequelize.Op;
const validator = require('validator');
const jwt = require('jsonwebtoken');
const mailgun = require('mailgun-js')({ apiKey: process.env.MAILGUN_API_KEY, domain: process.env.MAILGUN_DOMAIN, host: process.env.MAILGUN_HOST });
const Webscraper = require('./workers/webscraper')(Helpers, axios, cheerio);
const Mailer = require('./workers/mailer')(jwt, ejs, mailgun);
const { setIntervalAsync, clearIntervalAsync } = require('set-interval-async/dynamic')

/**
 * Use Sequelize to access Postgres
 */
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  protocol: 'postgres',
  logging: false
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
const User = require('./models/user')(sequelize, Sequelize.DataTypes);

sequelize
  .sync({ force: process.env.FORCE_DATABASE_SYNC === 'true' ? true : false })
  .then(res => {
    console.log('Database syncronization completed.');
    if (process.env.FORCE_DATABASE_SYNC === 'true') {
      console.log('Populating database...');

      var a = Product.build({
        productId: 'B07XRWZBJ9',
        shop: 'Amazon.de',
        url: 'http://www.amazon.de/dp/B07XRWZBJ9',
        partnerUrl: 'https://amzn.to/3dTnfqM',
        isEnabled: true,
        forceUpdate: true,
        isAvailable: false,
        price: 0.00,
        title: null
      });
      a.save();

    }
  })

/**
 * Run Webscraper as async setInterval
 */
setIntervalAsync(
  async () => {
    console.log('Running background tasks');
    var allProductsBefore = await Product.findAll({});
    var products = await Webscraper.run(Product);

    await Helpers.asyncForEach(products, async (product) => {

      let productBefore = allProductsBefore.find(p => p.id === product.id);
      var currentStatus = product.isAvailable;
      var previousStatus = productBefore.isAvailable;

      // Product is now available
      if (currentStatus === true && previousStatus === false) {

        // Fetch all users that should get a notification
        let users = await User.findAll({
          where: {
            isVerified: true,
            lastNotifiedAt: {
              [Op.or]: {
                [Op.lt]: new Date() - 24 * 60 * 60 * 1000, // notify only once every 24h
                [Op.eq]: null
              }
            }
          }
        });

        let productToken = jwt.sign({ id: product.id }, process.env.JWT_SECRET);

        await Helpers.asyncForEach(users, async (user) => {
          user.lastNotifiedAt = new Date();

          Mailer.send(user.email,
            '🧻🔥 Alarm! Es ist Toilettenpapier verfügbar!',
            'Es ist Toilettenpapier verfügbar!',
            `<p>Der Status der Verfügbarkeit von Toilettenpapier hat sich geändert:</p><p><b>${product.title} ist gerade bei ${product.shop} für ${product.price.toFixed(2).replace(/\./, ',')} € verfügbar.</b></p>`,
            'Produkt ansehen',
            `${process.env.BASE_URL}/product/${productToken}`,
            ['notification']
          );

          return await user.save();
        });

        return product;
      }
    });
  },
  1000 * 60 * 5 // run every 5 minutes
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
    if (products.length > 0) {
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
Server.use(express.json());
Server.use(express.urlencoded({ extended: true }));

/** 
 * Redirect from http to https 
 * */
Server.get('*', function (req, res, next) {
  if (req.headers['x-forwarded-proto'] != 'https' && process.env.NODE_ENV === 'production')
    res.redirect('https://' + req.headers.host + req.url);
  else
    next(); // Continue to other routes if we're not redirecting
});

/**
 * Core application 
 */
Server.get('/', function (req, res) {
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
 * Product details
 */
Server.get('/product/:token', async function (req, res) {
  let token = req.params.token;

  var availability = {
    available: false,
    products: []
  };

  jwt.verify(token, process.env.JWT_SECRET, function (err, data) {
    if (data) {
      Product.findOne({
        where: {
          id: data.id
        }
      }).then(product => {
        availability.products.push(product);
        if (product.isAvailable) {
          availability.available = true;
        }
        return res.render('product', {
          availability: availability
        });
      }).catch(err => {
        console.error(err);
        return res.render('confirmation', {
          title: 'Fehler!',
          message: `Es gab ein Problem mit deiner Anfrage.<br>Versuche es später noch einmal.`,
          showLink: true,
          link: 'Zurück zu Toilettenpapieralarm.de',
        });
      });
    } else {
      return res.render('confirmation', {
        title: 'Fehler!',
        message: `Es gab ein Problem mit deiner Anfrage.<br>Versuche es später noch einmal.`,
        showLink: true,
        link: 'Zurück zu Toilettenpapieralarm.de',
      });
    }
  });
});

/**
 * Subscribe for notification
 */
Server.get('/subscribe', function (req, res) {
  res.render('subscribe', {});
});

/**
 * Notifications
 */
Server.post('/subscribe', function (req, res, next) {
  var email = req.body.email ? req.body.email.trim() : null;
  if (email && req.body.acceptedTerms && validator.isEmail(email)) {
    // Insert into database if not already there
    let promise = User.findOrCreate({
      where: {
        email: email
      },
      defaults: {
        email: email,
        isVerified: false
      }
    });

    promise.then(user => {
      if (user[0] && user[0].isVerified == false) {
        let verificationToken = jwt.sign({ email: email, createdAt: user[0].createdAt }, process.env.JWT_SECRET, { expiresIn: '24h' });

        Mailer.send(email,
          'Bitte bestätige deine E-Mail-Adresse',
          'Bestätige jetzt deine E-Mail-Adresse!',
          `<p>Damit du zukünftig E-Mail-Benachrichtigungen von uns erhalten kannst, musst du deine E-Mail-Adresse noch bestätigen, in dem du innerhalb der nächsten 24 Stunden auf den folgenden Link klickst:</p>`,
          'E-Mail-Adresse bestätigen',
          `${process.env.BASE_URL}/subscribe/verify/${verificationToken}`,
          ['verify-email']
        );
      }

      res.render('confirmation', {
        title: 'Nur noch ein Schritt...',
        message: `Wir haben dir eine Nachricht an die angegebene E-Mail-Adresse geschickt.<br>
        Schau schnell nach und bestätige deine E-Mail-Adresse mit einem Klick auf den enthaltenen Link.`,
        showLink: true,
        link: 'Zurück zu Toilettenpapieralarm.de',
      });
    }).catch(err => {
      console.error(err);
      res.render('confirmation', {
        title: 'Fehler!',
        message: `Es gab ein Problem mit deiner Anfrage.<br>Versuche es später noch einmal.`,
        showLink: true,
        link: 'Zurück zu Toilettenpapieralarm.de',
      });
    });
  } else {
    res.render('confirmation', {
      title: 'Fehler!',
      message: `Es gab ein Problem mit deiner Anfrage.<br>Versuche es später noch einmal.`,
      showLink: true,
      link: 'Zurück zu Toilettenpapieralarm.de',
    });
  }
});

Server.get('/subscribe/verify/:token', function (req, res) {
  let token = req.params.token;

  jwt.verify(token, process.env.JWT_SECRET, function (err, data) {
    if (data) {
      User.findOne({
        where: {
          email: data.email,
          createdAt: data.createdAt,
          isVerified: false
        }
      }).then(user => {
        if(user) {
          user.isVerified = true;
          user.save().then(result => {
            res.render('confirmation', {
              title: 'E-Mail-Adresse erfolgreich bestätigt.',
              message: `Du erhältst ab sofort E-Mail-Benachrichtigungen, sobald sich der Verfügbarkeitsstatus ändert.`,
              showLink: true,
              link: 'Zu Toilettenpapieralarm.de',
            });
            return result;
          }).catch(err => {
            console.error(err);
            res.render('confirmation', {
              title: 'Fehler!',
              message: `Es gab ein Problem mit deiner Anfrage.<br>Versuche es später noch einmal.`,
              showLink: true,
              link: 'Zurück zu Toilettenpapieralarm.de',
            });
          });
        } else {
          res.render('confirmation', {
            title: 'Fehler!',
            message: `Der aufgerufene Link scheint fehlerhaft oder abgelaufen zu sein.`,
            showLink: true,
            link: 'Zurück zu Toilettenpapieralarm.de',
          });
        }
        return user;
      }).catch(err => {
        console.error(err);
        res.render('confirmation', {
          title: 'Fehler!',
          message: `Der aufgerufene Link scheint fehlerhaft oder abgelaufen zu sein.`,
          showLink: true,
          link: 'Zurück zu Toilettenpapieralarm.de',
        });
      })
    } else {
      res.render('confirmation', {
        title: 'Fehler!',
        message: `Der aufgerufene Link scheint fehlerhaft oder abgelaufen zu sein.`,
        showLink: true,
        link: 'Zurück zu Toilettenpapieralarm.de',
      });
    }
  });
});

Server.get('/unsubscribe/:token', function (req, res) {
  let token = req.params.token;

  jwt.verify(token, process.env.JWT_SECRET, function (err, data) {
    if (err) {
      res.render('confirmation', {
        title: 'Fehler!',
        message: `Der aufgerufene Link scheint fehlerhaft oder abgelaufen zu sein.`,
        showLink: true,
        link: 'Zurück zu Toilettenpapieralarm.de',
      });
    }
    if (data) {
      let promise = User.destroy(
        {
          where: {
            email: data.email
          },
        });

      promise.then(function (result) {
        if (result == 1) {
          res.render('confirmation', {
            title: 'Erfolgreich ausgetragen.',
            message: `Du erhältst ab sofort keine E-Mail-Benachrichtigungen mehr von uns.<br>
            Deine E-Mail-Adresse haben wir aus der Datenbank gelöscht.`,
            showLink: false
          });
        } else {
          res.render('confirmation', {
            title: 'Fehler!',
            message: `Der aufgerufene Link scheint fehlerhaft oder abgelaufen zu sein.`,
            showLink: true,
            link: 'Zurück zu Toilettenpapieralarm.de',
          });
        }
      }).catch(function (err) {
        console.error(err);
        res.render('confirmation', {
          title: 'Fehler!',
          message: `Es gab ein Problem mit deiner Anfrage.<br>Versuche es später noch einmal.`,
          showLink: true,
          link: 'Zurück zu Toilettenpapieralarm.de',
        });
      });
    }
  })
});

/**
 * Legal standard stuff
 */
Server.get('/impressum', function (req, res) {
  res.render('impressum', {
    address_line_1: process.env.ADDRESS_LINE_1,
    address_line_2: process.env.ADDRESS_LINE_2,
    address_line_3: process.env.ADDRESS_LINE_3,
    address_line_4: process.env.ADDRESS_LINE_4,
    address_line_5: process.env.ADDRESS_LINE_5
  });
});

Server.get('/datenschutz', function (req, res) {
  res.render('datenschutz', {
    address_line_1: process.env.ADDRESS_LINE_1,
    address_line_2: process.env.ADDRESS_LINE_2,
    address_line_3: process.env.ADDRESS_LINE_3,
    address_line_4: process.env.ADDRESS_LINE_4,
    address_line_5: process.env.ADDRESS_LINE_5,
  });
});

Server.use(express.static(path.join(__dirname, 'public')));

var port = process.env.PORT || 5000;
Server.listen(port, function () {
  console.log('Server is up and running at port ' + port);
});
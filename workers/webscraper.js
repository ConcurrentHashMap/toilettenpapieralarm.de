module.exports = (Helpers, axios, cheerio) => {
  const { Op } = require('sequelize');

  const Webscraper = {
    run: async (Product, timeout = 300000) => {

      var products = await Product.findAll({
        where: {
          isEnabled: true,
          [Op.or]: [
            {
              updatedAt: {
                [Op.lt]: new Date() - timeout,
              }
            },
            { forceUpdate: true }
          ]
        }
      });

      var updatedProducts = [];

      // For every product in our database, that was updated > $timeout ago, fetch again
      if (products && products.length > 0) {
        var scrape = async () => {
          await Helpers.asyncForEach(products, async (product) => {

            // Fetch content with axios
            var response = await axios({
              method: 'get',
              url: product.url,
              header: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36'
              },
            });

            var $ = cheerio.load(response.data);

            product.price = 0.0;

            if ($('#priceblock_ourprice').length) {
              product.price = Helpers.getPriceAsFloat($('#priceblock_ourprice').text());
            } else if ($('#priceblock_saleprice').length) {
              product.price = Helpers.getPriceAsFloat($('#priceblock_saleprice').text());
            }

            product.title = $('#productTitle').text().trim();
            product.brandName = $('#bylineInfo').text().trim();
            product.availability = $('#availability span').text().trim();
            product.deliveryMessage = $('#ddmDeliveryMessage').text().trim();
            product.merchant = $('#merchant-info').text().trim();
            product.isAvailable = Helpers.extractIsAvailable(product.availability);
            product.deliveryDate = Helpers.extractDeliveryDate(product.deliveryMessage);
            product.forceUpdate = false;

            updatedProducts.push(product);
            return await product.save();
          });
        }

        await scrape();

        return updatedProducts;
      }

      return updatedProducts;
    }
  }

  return Webscraper;
}
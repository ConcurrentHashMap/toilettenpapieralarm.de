module.exports = (sequelize, DataTypes) => {
  const Product = sequelize.define('Product', {
    productId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    title: {
      type: DataTypes.STRING
    },
    brandName: {
      type: DataTypes.STRING
    },
    shop: {
      type: DataTypes.STRING
    },
    merchant: {
      type: DataTypes.STRING
    },
    isAvailable: {
      type: DataTypes.BOOLEAN
    },
    availability: {
      type: DataTypes.STRING
    },
    deliveryDate: {
      type: DataTypes.DATE
    },
    deliveryMessage: {
      type: DataTypes.STRING
    },
    url: {
      type: DataTypes.STRING
    },
    partnerUrl: {
      type: DataTypes.STRING
    },
    price: {
      type: DataTypes.FLOAT
    },
    isEnabled: {
      type: DataTypes.BOOLEAN
    },
    forceUpdate: {
      type: DataTypes.BOOLEAN
    }
  }, {
    sequelize,
    modelName: 'product'
  });

  return Product;
}
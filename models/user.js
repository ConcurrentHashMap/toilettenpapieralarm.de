module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    isVerified: {
      type: DataTypes.BOOLEAN
    },
    lastNotifiedAt: {
      type: DataTypes.DATE
    }
  }, {
    sequelize,
    modelName: 'user'
  });

  return User;
}
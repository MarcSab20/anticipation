// src/modelsOrga/orgaService.js.js
import { Model,DataTypes } from 'sequelize'; 
import { ObjectStatus } from 'smp-core-schema';

export default (db ) => {
    class Service extends Model {}
  
    Service.init( {
      serviceID: {
        type: DataTypes.INTEGER,
        primaryKey: true,
      },
      uniqRef: {
        type: DataTypes.STRING(36),
        unique: true,
        allowNull: false
      },
      slug: {
        type: DataTypes.STRING(255),
        unique: true,
        allowNull: false
      },
      authorID: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      title: {
        type: DataTypes.STRING(128)
      },
      description: {
        type: DataTypes.TEXT
      },
      mediaBannerID: {
        type: DataTypes.INTEGER,
        allowNull: true 
      },
      termsAndConditionsID: {
        type: DataTypes.INTEGER,
        allowNull: true 
      },
      categoryID: {
        type: DataTypes.INTEGER,
        allowNull: true 
      },
      organizationID: {
        type: DataTypes.INTEGER,
        allowNull: true 
      },
      locationID: {
        type: DataTypes.INTEGER,
        allowNull: true 
      },
      negotiable: {
        type: DataTypes.BOOLEAN
      },
      state: {
        type: DataTypes.ENUM(Object.values(ObjectStatus)), 
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE 
      }
    }, {
      sequelize:db,
      modelName: 'Service',
      tableName: 'Service',
      timestamps: true 
    });
  
    return Service;
  };
  
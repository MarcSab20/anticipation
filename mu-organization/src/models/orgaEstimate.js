import { Model,DataTypes } from 'sequelize'; 
import { ObjectStatus, EstimateStage } from "smp-core-schema";



export default (db) => {
    class Estimate extends Model {};
  
    Estimate.init({
      estimateID: {
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
      operatorUserID: {
        type: DataTypes.INTEGER
      },
      authorID: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      buyerOrganizationID: {
        type: DataTypes.INTEGER
      },
      sellerOrganizationID: {
        type: DataTypes.INTEGER
      },
      serviceID: {
        type: DataTypes.INTEGER
      },
      referencePrice: {
        type: DataTypes.INTEGER
      },
      previewPrice: {
        type: DataTypes.INTEGER
      },
      comment: {
        type: DataTypes.TEXT
      },
      negociatedPrice: {
        type: DataTypes.INTEGER
      },
      stage: {
        type: DataTypes.STRING(255),
      },
      state: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE
      }
    }, {
      sequelize: db,
      modelName: 'Estimate',
      tableName: 'Estimate',
      timestamps: false
    });
  
    return Estimate;
  };
  
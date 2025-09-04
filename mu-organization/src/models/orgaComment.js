// src/modelsOrga/orgaComment.js.js

import { Model,DataTypes } from 'sequelize'; 
import { ObjectStatus } from "smp-core-schema";


export default (db) => {
    class Comment extends Model {}; 
  
    Comment.init({
      commentID: {
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
      commentContent: {
        type: DataTypes.TEXT
      },
      authorID: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      serviceID: {
        type: DataTypes.INTEGER
      },
      organizationID: {
        type: DataTypes.INTEGER
      },
      feedback: {
        type: DataTypes.INTEGER
      },
      state: {
        type: DataTypes.ENUM(Object.values(ObjectStatus)),
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE
      },
      createdAt: {
        type: DataTypes.DATE
      }
    }, {
      sequelize: db,
      modelName: 'Comment',
      tableName: 'Comment',
      timestamps: false
    });
  
    return Comment;
  };
  
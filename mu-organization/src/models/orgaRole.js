import { Model,DataTypes } from 'sequelize'; 
import { ObjectStatus } from 'smp-core-schema';

export default (sequelize) => {
  class Role extends Model {}; 

  Role.init({
    roleID: {
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
    roleName: {
      type: DataTypes.STRING(32)
    },
    description: {
      type: DataTypes.TEXT
    },
    permissions: {
      type: DataTypes.JSON
    },
    state: {
      type: DataTypes.ENUM(Object.values(ObjectStatus)), 
      allowNull: false
    },
    updatedAt: {
      type: DataTypes.DATE 
    }
  }, {
    sequelize, 
    modelName: 'Role',
    tableName: 'Role',
    timestamps: false 
  });

  return Role;
};
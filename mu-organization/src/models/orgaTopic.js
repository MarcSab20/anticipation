import { Model, DataTypes } from 'sequelize';
import { ObjectStatus } from 'smp-core-schema';

export default (db) => {
  class Topic extends Model {}

  Topic.init({
    topicID: {
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
      type: DataTypes.STRING(255)
    },
    description: {
      type: DataTypes.TEXT
    },
    level: {
      type: DataTypes.INTEGER
    },
    parentTopicID: {
      type: DataTypes.INTEGER,
      references: {
        model: 'Topic',
        key: 'topicID'
      },
      allowNull: true // Si un sujet parent est facultatif
    },
    state: {
        type: DataTypes.ENUM(Object.values(ObjectStatus)), 
        allowNull: false
      },
    updatedAt: {
      type: DataTypes.DATE // Sequelize utilise DataTypes.DATE pour les champs TIMESTAMPTZ
    }
  }, {
    sequelize:db,
    modelName: 'Topic',
    tableName: 'Topic',
    timestamps: true // Indique à Sequelize de gérer les champs 'createdAt' et 'updatedAt'
  });

  return Topic;
};

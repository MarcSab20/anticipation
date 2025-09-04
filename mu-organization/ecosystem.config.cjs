module.exports = {
  apps: [
    {
      name: 'mu-organization',
      script: 'organization.mjs',
      interpreter: 'node',
      interpreter_args: '--experimental-vm-modules',

      // Environnement staging
      env_staging: {
        NODE_ENV: 'staging'
      },

      // Environnement production
      env_production: {
        NODE_ENV: 'production'
      },

      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      log_date_format: 'YYYY-MM-DD HH:mm Z'
    }
  ]
};

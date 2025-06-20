import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

console.log('🔍 Initialisation du tracing OpenTelemetry...');

const sdk = new NodeSDK({
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-graphql': {
        enabled: true,
        mergeItems: true,
        allowValues: true,
        depth: 2
      },
      '@opentelemetry/instrumentation-http': {
        enabled: true,
        requestHook: (span, request) => {
          span.setAttributes({
            'http.request.headers.user_agent': request.headers['user-agent'] || '',
            'http.request.headers.x_trace_id': request.headers['x-trace-id'] || '',
            'http.request.headers.x_user_id': request.headers['x-user-id'] || ''
          });
        }
      },
      '@opentelemetry/instrumentation-express': {
        enabled: true
      }
    })
  ]
});

// Démarrage conditionnel du SDK
try {
  sdk.start();
  console.log('✅ OpenTelemetry démarré avec succès');
} catch (error) {
  console.warn('⚠️ Erreur lors du démarrage d\'OpenTelemetry:', error.message);
  console.log('🔄 Continuant sans tracing...');
}

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('OpenTelemetry terminé proprement'))
    .catch((error) => console.log('Erreur lors de l\'arrêt d\'OpenTelemetry', error))
    .finally(() => process.exit(0));
});

export default sdk;
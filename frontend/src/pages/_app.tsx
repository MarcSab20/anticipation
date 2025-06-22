import { AppProps } from 'next/app';
import { ApolloProvider } from '@apollo/client';
import { ToastContainer } from 'react-toastify';
import { apolloClient } from '../lib/apollo-client';
import '../styles/globals.css';
import 'react-toastify/dist/ReactToastify.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ApolloProvider client={apolloClient}>
      <Component {...pageProps} />
      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
    </ApolloProvider>
  );
}
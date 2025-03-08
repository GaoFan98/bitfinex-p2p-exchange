import {getConfig} from './config';

const config = getConfig();

if (config.nodeType === 'server') {
    // TODO implement server and client connection
    import('./server')
        .then(() => console.log('Server started'))
        .catch(err => {
            console.error('Failed to start server:', err);
            process.exit(1);
        });
} else {
    import('./client')
        .then(() => console.log('Client started'))
        .catch(err => {
            console.error('Failed to start client:', err);
            process.exit(1);
        });
}
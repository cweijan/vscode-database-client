const ERRORS = {
    MISSING_CONNECTION_CONFIG: 'Expected to be given `connection` options.',
    MISSING_CONNECTION_HOST: 'Expected to be given `host` connection option.',
    MISSING_CONNECTION_DATABASE:
        'Expected to be given `database` connection option.',
    MISSING_CONNECTION_USER: 'Expected to be given `user` connection option.',
    MISSING_CONNECTION_PASSWORD:
        'Expected to be given `password` connection option.',
} as const;

export { ERRORS };

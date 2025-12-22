export default {
    stories: ['../stories/**/*.stories.@(js|jsx|ts|tsx|mdx)'],
    addons: [
        '@storybook/addon-links',
        '@storybook/addon-essentials',
        '@storybook/addon-interactions',
    ],
    framework: {
        name: '@storybook/web-components-vite',
        options: {},
    },
    docs: {
        autodocs: 'tag',
    },
    core: {
        builder: '@storybook/builder-vite',
    },
    async viteFinal(config) {
        // Merge custom configuration
        return {
            ...config,
            resolve: {
                ...config.resolve,
                alias: {
                    ...config.resolve?.alias,
                    '@': '/js',
                    '@core': '/js/core',
                    '@utils': '/js/utils',
                    '@ui': '/js/ui',
                    '@shared': '/js/shared',
                },
            },
        };
    },
};

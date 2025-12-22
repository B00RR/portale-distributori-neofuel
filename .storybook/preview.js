/** @type { import('@storybook/web-components').Preview } */

import '../css/index.css'; // Import main styles

export default {
    parameters: {
        actions: { argTypesRegex: '^on[A-Z].*' },
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/,
            },
        },
        backgrounds: {
            default: 'light',
            values: [
                {
                    name: 'light',
                    value: '#F4F6F8',
                },
                {
                    name: 'dark',
                    value: '#0A2342',
                },
                {
                    name: 'white',
                    value: '#ffffff',
                },
            ],
        },
    },
};

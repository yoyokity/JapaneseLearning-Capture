export default {
    'packagerConfig': {
        'name': 'JapLC',
        'icon': 'resources/icon.ico',
        'overwrite': true,
        'asar': {
            'unpack': '**/node_modules/@img/**'
        },
        'appVersion': '1.0.1',
        'appCopyright': 'Copyright © 2080 yoyokity',
        'extraResource': [
            'resources/tools'
        ],
        'ignore': [
            '.git',
            '.vscode',
            '.idea',
            'node_modules/.cache',
            '^/resources($|/)',
            '^/log($|/)',
        ],
        'win32metadata': {
            'ProductName': 'japanese-learning-capture',
        },
    },
    'makers': [
        {
            'name': '@electron-forge/maker-squirrel',
            'config': {
                'name': 'electron_quick_start'
            }
        },
        {
            'name': '@electron-forge/maker-zip',
            'platforms': [
                'darwin'
            ]
        },
        {
            'name': '@electron-forge/maker-deb',
            'config': {}
        },
        {
            'name': '@electron-forge/maker-rpm',
            'config': {}
        }
    ]
}
import { defineConfig } from 'vite-plus'

export default defineConfig({
    staged: {
        '*': ['eslint --fix', 'prettier --write --experimental-cli']
    }
})

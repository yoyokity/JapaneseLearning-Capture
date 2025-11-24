import { definePreset } from '@primeuix/themes'
import Theme from '@primeuix/themes/aura'

export const theme = definePreset(Theme, {
    semantic: {
        primary: {
            50: '{pink.50}',
            100: '{pink.100}',
            200: '{pink.200}',
            300: '{pink.300}',
            400: '{pink.400}',
            500: '{pink.500}',
            600: '{pink.600}',
            700: '{pink.700}',
            800: '{pink.800}',
            900: '{pink.900}',
            950: '{pink.950}'
        },
        colorScheme: {
            light: {
                surface: {
                    0: '#ffffff',
                    50: '{neutral.50}',
                    100: '{neutral.100}',
                    200: '{neutral.200}',
                    300: '{neutral.300}',
                    400: '{neutral.400}',
                    500: '{neutral.500}',
                    600: '{neutral.600}',
                    700: '{neutral.700}',
                    800: '{neutral.800}',
                    900: '{neutral.900}',
                    950: '{neutral.950}'
                },
                primary: {
                    color: '{primary.400}',
                    inverseColor: '#ffffff',
                    hoverColor: '{primary.300}',
                    activeColor: '{primary.500}'
                },
                formField: {
                    shadow: 'initial', //去除控件阴影
                    borderRadius: 'var(--border-radius)' //控件圆角
                },
                text: {
                    // 次要文字颜色
                    muted: {
                        color: '{surface.400}',
                        hoverColor: '{surface.500}'
                    }
                },
                mask: {
                    background: 'rgba(0, 0, 0, 0.3)',
                    transitionDuration: '0.3s'
                },
                dialog: {
                    borderRadius: 'calc(var(--border-radius) * 2)',
                    shadow: 'var(--p-overlay-modal-shadow)',
                    background: 'var(--p-overlay-modal-background)',
                    borderColor: 'var(--p-overlay-modal-border-color)',
                    color: 'var(--p-overlay-modal-color)',
                    contentPadding: 'var(--dialog-padding-y) var(--dialog-padding-x)'
                }
            }
        }
    },
    components: {
        // 滚动页面
        scrollpanel: {
            colorScheme: {
                light: {
                    bar: {
                        background: '{surface.300}'
                    }
                }
            }
        },
        dialog: {
            header: {
                padding: '2rem'
            },
            content: {
                padding: '0 2rem 2rem 2rem'
            }
        }
    }
})

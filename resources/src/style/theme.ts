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
					50: '{zinc.50}',
					100: '{zinc.100}',
					200: '{zinc.200}',
					300: '{zinc.300}',
					400: '{zinc.400}',
					500: '{zinc.500}',
					600: '{zinc.600}',
					700: '{zinc.700}',
					800: '{zinc.800}',
					900: '{zinc.900}',
					950: '{zinc.950}'
				},
				primary: {
					color: '{primary.400}',
					inverseColor: '#ffffff',
					hoverColor: '{primary.300}',
					activeColor: '{primary.500}'
				}
			}
		}
	}
})

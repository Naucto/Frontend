# Configuration file for the Sphinx documentation builder.

# -- Project information -----------------------------------------------------

project = 'Naucto'
copyright = '2026, Naucto Team'
author = 'Naucto Team'
release = '1.0'

# -- General configuration ---------------------------------------------------

extensions = [
    'sphinx.ext.autosectionlabel',
]

autosectionlabel_prefix_document = True

templates_path = ['_templates']
exclude_patterns = ['_build', 'Thumbs.db', '.DS_Store']

# -- Options for HTML output -------------------------------------------------

html_theme = 'furo'
html_title = 'Naucto Game Engine'
html_static_path = ['_static']

html_theme_options = {
    'light_css_variables': {
        'color-brand-primary': '#2962ff',
        'color-brand-content': '#2962ff',
    },
    'dark_css_variables': {
        'color-brand-primary': '#82b1ff',
        'color-brand-content': '#82b1ff',
    },
}

# -- Syntax highlighting -----------------------------------------------------

highlight_language = 'lua'
pygments_style = 'monokai'
pygments_dark_style = 'monokai'

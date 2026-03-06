/**
 * DataSpren runtime initialization Python code.
 *
 * This code is executed in Pyodide after packages are installed.
 * It sets up DuckDB, matplotlib styling, and the sql_func decorator.
 */

export const INIT_PYTHON_CODE = `
import warnings
warnings.filterwarnings('ignore', message='numpy.core is deprecated')
warnings.filterwarnings('ignore', message='FigureCanvasAgg is non-interactive')

import duckdb
import pandas as pd
import inspect
import typing

# Configure matplotlib for non-interactive use
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import io
import base64

# Apply SciencePlots style configuration
# https://github.com/garrettj403/SciencePlots
plt.rcParams.update({
    # Color cycle: blue, green, yellow, red, violet, gray
    'axes.prop_cycle': plt.cycler('color', [
        '#0C5DA5', '#00B945', '#FF9500', '#FF2C00', '#845B97', '#474747', '#9e9e9e'
    ]),
    
    # Figure size
    'figure.figsize': (5, 3.75),
    'figure.dpi': 300,
    'savefig.dpi': 300,
    
    # Font sizes (small for compact figures)
    'font.size': 8,
    'axes.labelsize': 8,
    'axes.titlesize': 9,
    'xtick.labelsize': 7,
    'ytick.labelsize': 7,
    'legend.fontsize': 7,
    
    # X axis
    'xtick.direction': 'in',
    'xtick.major.size': 3,
    'xtick.major.width': 0.5,
    'xtick.minor.size': 1.5,
    'xtick.minor.width': 0.5,
    'xtick.minor.visible': True,
    'xtick.top': True,
    
    # Y axis
    'ytick.direction': 'in',
    'ytick.major.size': 3,
    'ytick.major.width': 0.5,
    'ytick.minor.size': 1.5,
    'ytick.minor.width': 0.5,
    'ytick.minor.visible': True,
    'ytick.right': True,
    
    # Line widths
    'axes.linewidth': 0.5,
    'grid.linewidth': 0.5,
    'lines.linewidth': 1.,
    
    # Legend
    'legend.frameon': False,
    
    # Save settings
    'savefig.bbox': 'tight',
    'savefig.pad_inches': 0.05,
    
    # Serif fonts (like the example figure)
    'font.family': 'serif',
    'font.serif': ['DejaVu Serif', 'Times', 'Times New Roman', 'serif'],
    'mathtext.fontset': 'dejavuserif',
    
    # No LaTeX (browser environment)
    'text.usetex': False,
})

# Initialize DuckDB connection
_duckdb_conn = duckdb.connect(':memory:')


def _capture_figure(dpi=300):
    """Capture the current matplotlib figure as a base64-encoded PNG."""
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=dpi, bbox_inches='tight', facecolor='white', edgecolor='none')
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode('utf-8')
    plt.close('all')
    return img_base64


# Registry for user-defined functions
_registered_udfs = {}

# Type mappings for DuckDB
_type_map = {
    str: duckdb.typing.VARCHAR,
    int: duckdb.typing.BIGINT,
    float: duckdb.typing.DOUBLE,
    bool: duckdb.typing.BOOLEAN,
}

_type_name_map = {
    str: "VARCHAR",
    int: "BIGINT",
    float: "DOUBLE",
    bool: "BOOLEAN",
}


def _get_duckdb_type(py_type):
    """Convert Python type annotation to DuckDB type."""
    origin = typing.get_origin(py_type)
    if origin is typing.Union:
        args = [a for a in typing.get_args(py_type) if a is not type(None)]
        if args:
            return _type_map.get(args[0], duckdb.typing.VARCHAR)
    return _type_map.get(py_type, duckdb.typing.VARCHAR)


def _get_type_name(py_type):
    """Get human-readable type name from Python type annotation."""
    if py_type is None:
        return "VARCHAR"
    origin = typing.get_origin(py_type)
    if origin is typing.Union:
        args = [a for a in typing.get_args(py_type) if a is not type(None)]
        if args:
            return _type_name_map.get(args[0], "VARCHAR")
    return _type_name_map.get(py_type, "VARCHAR")


def sql_func(fn):
    """
    Decorator to register a Python function as a DuckDB UDF.
    Uses type annotations to infer parameter and return types.
    
    Example:
        @sql_func
        def double_it(x: int) -> int:
            return x * 2
        
        # Then use in SQL:
        # SELECT double_it(value) FROM my_table
    """
    sig = inspect.signature(fn)
    hints = typing.get_type_hints(fn)
    
    param_types = []
    param_info = []
    for param_name in sig.parameters:
        if param_name in hints:
            param_types.append(_get_duckdb_type(hints[param_name]))
            param_info.append({"name": param_name, "type": _get_type_name(hints[param_name])})
        else:
            param_types.append(duckdb.typing.VARCHAR)
            param_info.append({"name": param_name, "type": "VARCHAR"})
    
    return_type = duckdb.typing.VARCHAR
    return_type_name = "VARCHAR"
    if 'return' in hints:
        return_type = _get_duckdb_type(hints['return'])
        return_type_name = _get_type_name(hints['return'])
    
    return_hint = hints.get('return')
    null_handling = 'default'
    if return_hint:
        origin = typing.get_origin(return_hint)
        if origin is typing.Union and type(None) in typing.get_args(return_hint):
            null_handling = 'special'
    
    if fn.__name__ in _registered_udfs:
        try:
            _duckdb_conn.remove_function(fn.__name__)
        except:
            pass
    
    _duckdb_conn.create_function(
        fn.__name__,
        fn,
        param_types,
        return_type,
        null_handling=null_handling
    )
    _registered_udfs[fn.__name__] = {
        "name": fn.__name__,
        "parameters": param_info,
        "returnType": return_type_name
    }
    
    return fn
`;

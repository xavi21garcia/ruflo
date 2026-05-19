import React, { useState } from 'react';

const SECTORES = [
  'Residencial', 'Comercial', 'Oficinas', 'Industrial', 'Sanitario',
  'Educativo', 'Hotelero', 'Deportivo', 'Cultural', 'Religioso',
  'Mixto', 'Logistico', 'Agroindustrial',
];

export default function SearchForm({ onSubmit, disabled }) {
  const [form, setForm] = useState({
    pais: '',
    region: '',
    sector: '',
    ciudad: '',
    carpetaDescarga: '',
    mock: false,
  });

  const update = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.pais || !form.region || !form.sector) return;
    onSubmit(form);
  };

  const isValid = form.pais && form.region && form.sector;

  return (
    <form className="search-form" onSubmit={handleSubmit}>
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="pais">Pais *</label>
          <input
            id="pais"
            type="text"
            placeholder="Ej: El Salvador, Espana, Mexico..."
            value={form.pais}
            onChange={update('pais')}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="region">Region / Comunidad *</label>
          <input
            id="region"
            type="text"
            placeholder="Ej: Nacional, Cataluna, CDMX..."
            value={form.region}
            onChange={update('region')}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="sector">Sector de edificacion *</label>
          <select id="sector" value={form.sector} onChange={update('sector')} required>
            <option value="">Seleccionar sector...</option>
            {SECTORES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="ciudad">Ciudad (opcional)</label>
          <input
            id="ciudad"
            type="text"
            placeholder="Ej: San Salvador, Barcelona..."
            value={form.ciudad}
            onChange={update('ciudad')}
          />
        </div>
      </div>

      <div className="form-group form-full">
        <label htmlFor="carpeta">Carpeta de descarga (opcional)</label>
        <input
          id="carpeta"
          type="text"
          placeholder="Ruta donde guardar documentos. Ej: C:\Normativas\Proyecto1"
          value={form.carpetaDescarga}
          onChange={update('carpetaDescarga')}
        />
      </div>

      <div className="form-group form-full mock-toggle">
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={form.mock}
            onChange={(e) => setForm(prev => ({ ...prev, mock: e.target.checked }))}
          />
          <span>Modo simulacion (sin tokens, datos de ejemplo)</span>
        </label>
      </div>

      <button type="submit" className="btn btn-primary" disabled={disabled || !isValid}>
        {form.mock ? 'Iniciar simulacion' : 'Iniciar busqueda de normativas'}
      </button>
    </form>
  );
}

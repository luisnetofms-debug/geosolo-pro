import JSZip from 'jszip';
import { Client, Farm, Plot, SamplingPoint } from '../types';

export function generateGPX(points: SamplingPoint[], plotName: string): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GeoSolo CRM" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Pontos de Amostragem - ${escapeXml(plotName)}</name>
    <desc>Grade de coletas georreferenciadas de solo geradas pelo GeoSolo.</desc>
    <time>${new Date().toISOString()}</time>
  </metadata>`;

  points.forEach((p) => {
    const lat = p.lat.toFixed(7);
    const lng = p.lng.toFixed(7);
    const resultsDesc = p.results 
      ? `pH: ${p.results.pH}, MO: ${p.results.MO}%, P: ${p.results.P}mg/dm³, K: ${p.results.K}mmolc` 
      : 'Aguardando laboratório';

    xml += `
  <wpt lat="${lat}" lon="${lng}">
    <ele>0.0</ele>
    <name>Ponto ${p.pointNumber}</name>
    <desc>Coletado: ${p.isCollected ? 'Sim' : 'Não'} | ${resultsDesc}</desc>
    <sym>Waypoint</sym>
  </wpt>`;
  });

  xml += '\n</gpx>';
  return xml;
}

export function generateKML(points: SamplingPoint[], plot: Plot): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Amostragem de Solo - ${escapeXml(plot.name)}</name>
    <description><![CDATA[Pontos georreferenciados gerados pelo GeoSolo]]></description>
    
    <!-- Estilo para os pontos -->
    <Style id="samplingPoint">
      <IconStyle>
        <color>ff00ff00</color> <!-- Verde -->
        <scale>1.1</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/paddle/grn-circle.png</href>
        </Icon>
      </IconStyle>
    </Style>
    
    <Style id="plotBoundary">
      <LineStyle>
        <color>ff0000ff</color> <!-- Vermelho -->
        <width>3</width>
      </LineStyle>
      <PolyStyle>
        <color>40ffffff</color> <!-- Semi-transparente -->
      </PolyStyle>
    </Style>
  `;

  // Add Plot Boundary Polyline
  if (plot.boundaryPoints && plot.boundaryPoints.length > 0) {
    xml += `
    <Placemark>
      <name>Limite do Talhão - ${escapeXml(plot.name)}</name>
      <styleUrl>#plotBoundary</styleUrl>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
            ${plot.boundaryPoints.map((bp) => `${bp.lng},${bp.lat},0`).join('\n            ')}
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
    `;
  }

  // Add Waypoints
  points.forEach((p) => {
    const lat = p.lat;
    const lng = p.lng;
    const status = p.isCollected ? 'Coletado' : 'Não Coletado';
    const results = p.results 
      ? `pH: ${p.results.pH} | MO: ${p.results.MO}% | P: ${p.results.P} mg/dm³ | K: ${p.results.K} mmolc/dm³` 
      : 'Sem análise laboratorial';

    xml += `
    <Placemark>
      <name>P${p.pointNumber}</name>
      <description><![CDATA[<b>Status:</b> ${status}<br><b>Resultados:</b> ${results}]]></description>
      <styleUrl>#samplingPoint</styleUrl>
      <Point>
        <coordinates>${lng},${lat},0</coordinates>
      </Point>
    </Placemark>`;
  });

  xml += `
  </Document>
</kml>`;
  return xml;
}

export function generateGeoJSON(points: SamplingPoint[], plot: Plot): string {
  const features: any[] = [];

  // Add boundary poly
  if (plot.boundaryPoints && plot.boundaryPoints.length > 0) {
    features.push({
      type: 'Feature',
      properties: {
        name: plot.name,
        type: 'talhao_limite',
        areaHectares: plot.areaHectares,
        cropType: plot.cropType
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          plot.boundaryPoints.map((bp) => [bp.lng, bp.lat])
        ]
      }
    });
  }

  // Add points
  points.forEach((p) => {
    features.push({
      type: 'Feature',
      properties: {
        pointId: p.id,
        pointNumber: p.pointNumber,
        isCollected: p.isCollected,
        collectionDate: p.collectionDate || '',
        pH: p.results?.pH || null,
        MO: p.results?.MO || null,
        P: p.results?.P || null,
        K: p.results?.K || null,
        Ca: p.results?.Ca || null,
        Mg: p.results?.Mg || null,
        Al: p.results?.Al || null,
      },
      geometry: {
        type: 'Point',
        coordinates: [p.lng, p.lat]
      }
    });
  });

  const geojson = {
    type: 'FeatureCollection',
    features: features
  };

  return JSON.stringify(geojson, null, 2);
}

export function generateCSV(points: SamplingPoint[], plotName: string): string {
  const headers = [
    'Ponto', 'Latitude', 'Longitude', 'Status', 'Data_Coleta',
    'pH_CaCl2', 'Materia_Organica_perc', 'Fosforo_mg_dm3',
    'Potassio_mmolc_dm3', 'Calcio_mmolc_dm3', 'Magnesio_mmolc_dm3', 'Aluminio_mmolc_dm3'
  ];

  let csvContent = headers.join(';') + '\n';

  points.forEach((p) => {
    const row = [
      p.pointNumber,
      p.lat.toFixed(7),
      p.lng.toFixed(7),
      p.isCollected ? 'COLETADO' : 'PLANEJADO',
      p.collectionDate || '',
      p.results?.pH || '',
      p.results?.MO || '',
      p.results?.P || '',
      p.results?.K || '',
      p.results?.Ca || '',
      p.results?.Mg || '',
      p.results?.Al || ''
    ];
    csvContent += row.join(';') + '\n';
  });

  return csvContent;
}

// Escapes special characters for XML strings safely
function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

// Triggers the download of a multi-format ZIP with high-fidelity files
export async function downloadGISZip(
  client: Client,
  farm: Farm,
  plot: Plot,
  points: SamplingPoint[]
): Promise<void> {
  const zip = new JSZip();
  const folderName = `${client.name.replace(/\s+/g, '_')}-${farm.name.replace(/\s+/g, '_')}-${plot.name.replace(/\s+/g, '_')}`;

  const gpxData = generateGPX(points, plot.name);
  const kmlData = generateKML(points, plot);
  const geojsonData = generateGeoJSON(points, plot);
  const csvData = generateCSV(points, plot.name);

  // Readme instructions for precision equipment import: Garmin, Trimble, John Deere, etc.
  const readme = `========================================================================
GEOSOLO - PLATAFORMA DE AGRICULTURA DE PRECISÃO
Relatório de Exportação Georreferenciada para GPS de Mão e GIS
========================================================================
Cliente: ${client.name}
Fazenda: ${farm.name} (${farm.city} - ${farm.state})
Talhão: ${plot.name} (${plot.areaHectares} Hectares - Cultura: ${plot.cropType})
Total de Pontos de Amostragem: ${points.length} pontos

ESTRUTURA DOS ARQUIVOS NESTE PACOTE ZIP:
------------------------------------------------------------------------
1. [gpx] .gpx : Arquivo XML padrão para importação em GPS de Mão 
   (ex: Garmin GPSMAP, eTrex). Insira na pasta "/GPX" do cartão de memória.
   
2. [kml] .kml : Arquivo para visualização direta no Google Earth 
   Pro ou Google Maps no celular da equipe de campo.
   
3. [geojson] .geojson : Arquivo Geográfico estendido, ideal para 
   importação imediata no QGIS, ArcGIS ou softwares de aviação agrícola.
   
4. [csv] .csv (Delimitador ";") : Planilha de coordenadas e teores,
   contendo todas as coordenadas decimais e análises de fertilidade.
   Útil para importar no Excel ou alimentar adubadoras em taxa variável.

5. [shp] .prj & .shp-stub : Metadados e representações geodésicas de 
   Projeção WGS84 para integração em softwares agrícolas legados.
   
Gerado em: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')} UTC
`;

  // We write GIS standard PRJ projection for WGS 84 so it aligns with Shapefile GIS applications
  const prj = `GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]`;

  zip.file(`${folderName}/README-IMPORTACAO.txt`, readme);
  zip.file(`${folderName}/GPS_MAO_PONTOS.gpx`, gpxData);
  zip.file(`${folderName}/GOOGLE_EARTH_MAPA.kml`, kmlData);
  zip.file(`${folderName}/SIG_GEOJSON.geojson`, geojsonData);
  zip.file(`${folderName}/PLANILHA_AMOSTRAS_LAB.csv`, csvData);
  zip.file(`${folderName}/SHAPEFILE_METADADOS_WGS84.prj`, prj);

  // Generate the zip binary blob
  const content = await zip.generateAsync({ type: 'blob' });
  
  // Downloader anchor logic
  const link = document.createElement('a');
  link.href = URL.createObjectURL(content);
  link.download = `GeoSolo_Export_${folderName}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

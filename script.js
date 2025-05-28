// Inisialisasi peta
const map = L.map("map").setView([-0.5, 117.0], 10);

const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap",
}).addTo(map);

const esriImagery = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    attribution: "© Esri, Maxar",
  }
);

const baseMaps = {
  OpenStreetMap: osm,
  "Esri Imagery": esriImagery,
};

let shpGeoJson = null;
let afdlayer = L.layerGroup().addTo(map);
let hguLayer = L.layerGroup().addTo(map);
let shpLayer = L.layerGroup().addTo(map);

// Layer Control
const overlays = {
  "Batas HGU": hguLayer,
  "Batas Blok": shpLayer,
  "Batas AFD": afdlayer,
};
L.control.layers(baseMaps, overlays).addTo(map);

// Muat Layer GeoJSON
fetch("data/HGU.geojson")
  .then((res) => res.json())
  .then((data) => {
    L.geoJSON(data, {
      style: { color: "orange", weight: 4, fillOpacity: 0 },
    }).addTo(hguLayer);
  });

fetch("data/AFD.geojson")
  .then((res) => res.json())
  .then((data) => {
    const afdGeoJson = L.geoJSON(data, {
      style: { color: "black", weight: 2, fillOpacity: 0 },
      onEachFeature: (feature, layer) => {
        layer.bindTooltip(feature.properties.AFD || "AFD", {
          permanent: false,
          direction: "center",
          className: "label-afd-background",
        });
      },
    }).addTo(afdlayer);
    
    // Fungsi untuk kontrol tooltip berdasarkan zoom
    const controlTooltips = () => {
      const zoom = map.getZoom();
      afdGeoJson.eachLayer(layer => {
        if (zoom >= 15) {
          layer.openTooltip(); // Paksa tampil
        } else {
          layer.closeTooltip(); // Paksa sembunyi
        }
      });
    };
    
    // Jalankan saat pertama kali load
    controlTooltips();
    
    // Jalankan setiap zoom berubah
    map.on("zoom", controlTooltips);
  });

fetch("data/Master_Blok_Pencapaian_Produksi.geojson")
  .then((res) => res.json())
  .then((data) => {
    shpGeoJson = L.geoJSON(data, {
      style: {
        color: "gray",
        fillColor: "gray",
        weight: 1,
        fillOpacity: 0.5,
      },
      onEachFeature: (feature, layer) => {
        const Blok = feature.properties.Blok || "Tidak Diketahui";
        const Luas = feature.properties.Luas ||"-";
        layer.bindPopup(`Blok: ${Blok}<br>Luas: ${Luas} Ha`);
        layer.bindTooltip(feature.properties.Blok || "Blok", {
          permanent: true,
          direction: "center",
          className: "label-blok",
        });
      },
    }).addTo(shpLayer);
    map.fitBounds(shpGeoJson.getBounds());
    map.on("zoom", () => {
      const Zoom = map.getZoom();
      shpGeoJson.eachLayer(layer => {
        if (Zoom >= 15) layer.openTooltip();
        else layer.closeTooltip();
      });
    });
  });

// Upload Excel
document.getElementById("input-excel").addEventListener("change", function (e) {
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = function (e) {
    const workbook = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet);

    const kategori = {
      tanpa_serangan: { blok: 0, luas: 0 },
      rendah: { blok: 0, luas: 0 },
      sedang: { blok: 0, luas: 0 },
      tinggi: { blok: 0, luas: 0 },
    };

    const blokToTKB = {};
    json.forEach((row) => {
      const blok = row.Blok;
      const tkb = parseFloat(row.TKB);
      const luas = parseFloat(row.Luas);
      if (!blok || isNaN(tkb)) return;
      blokToTKB[blok] = tkb;
      if (tkb === 0) {
        kategori.tanpa_serangan.blok++;
        kategori.tanpa_serangan.luas += luas;
      } else if (tkb <= 5) {
        kategori.rendah.blok++;
        kategori.rendah.luas += luas;
      } else if (tkb <= 10) {
        kategori.sedang.blok++;
        kategori.sedang.luas += luas;
      } else {
        kategori.tinggi.blok++;
        kategori.tinggi.luas += luas;
      }
    });

    // Buat tabel rekap
    const totalBlok = Object.values(kategori).reduce((a, b) => a + b.blok, 0);
    const totalLuas = Object.values(kategori).reduce((a, b) => a + b.luas, 0);

    document.getElementById("rekap-tabel").innerHTML = `
      <table border="1" cellpadding="6" style="border-collapse: collapse; text-align: center;">
        <tr style="background:#f0f0f0;"><th>Kategori</th><th>Jumlah Blok</th><th>Luas (Ha)</th></tr>
        <tr><td>Tanpa Serangan</td><td>${kategori.tanpa_serangan.blok}</td><td>${kategori.tanpa_serangan.luas.toFixed(2)}</td></tr>
        <tr><td>Rendah</td><td>${kategori.rendah.blok}</td><td>${kategori.rendah.luas.toFixed(2)}</td></tr>
        <tr><td>Sedang</td><td>${kategori.sedang.blok}</td><td>${kategori.sedang.luas.toFixed(2)}</td></tr>
        <tr><td>Tinggi</td><td>${kategori.tinggi.blok}</td><td>${kategori.tinggi.luas.toFixed(2)}</td></tr>
        <tr style="font-weight:bold; background:#f0f0f0;"><td>Total</td><td>${totalBlok}</td><td>${totalLuas.toFixed(2)}</td></tr>
      </table>
    `;

    // Warnai GeoJSON berdasarkan TKB
    shpGeoJson.eachLayer((layer) => {
      const blok = layer.feature.properties.Blok;
      const tkb = blokToTKB[blok];
      if (tkb === undefined) return;
      let fill = "gray";
      if (tkb === 0) fill = "#80B6D4";
      else if (tkb <= 5) fill = "#7FFF00";
      else if (tkb <= 10) fill = "#FFFF00";
      else fill = "#e74c3c";
      layer.setStyle({ fillColor: fill, fillOpacity: 0.7 });
      layer.feature.properties.TKB = tkb;
    });
    if (!map.hasLayer(legend)) legend.addTo(map);
  };
  reader.readAsArrayBuffer(file);
});

// Legend
const legend = L.control({ position: 'bottomleft' });
legend.onAdd = function () {
    const div = L.DomUtil.create('div', 'info legend');
    const grades = [
        { label: "Tanpa Serangan", color: "#80B6D4" },
        { label: "Rendah (0 - 5%)", color: "#7FFF00" },
        { label: "Sedang (5 - 10%)", color: "#FFFF00" },
        { label: "Tinggi (> 10%)", color: "#e74c3c" }
    ];
    let html = '<strong>Kategori Serangan</strong><br>';
    grades.forEach(g => {
        html += `<i style="background:${g.color}; width: 18px; height: 18px; float: left; margin-right: 8px; opacity: 0.9;"></i>${g.label}<br>`;
    });
    div.innerHTML = html;
    return div;
};

// Perbaikan untuk masalah positioning dan base map capture
document.getElementById("download-trigger").addEventListener("click", async () => {
  document.getElementById("print-tabel").innerHTML = document.getElementById("rekap-tabel").innerHTML;
  document.getElementById("print-layout").style.display = "block";

  const legendContent = document.getElementById("legend-content");
  const legendElement = document.querySelector('.legend');
  if (legendElement) {
    legendContent.innerHTML = legendElement.innerHTML;
  }
  
  // Hapus peta sebelumnya jika ada
  const printMapContainer = document.getElementById("print-map-container");
  printMapContainer.innerHTML = "";
  
  // PENTING: Set ukuran container secara eksplisit
  printMapContainer.style.width = "1000px";
  printMapContainer.style.height = "700px";
  printMapContainer.style.position = "relative";
  
  const printMap = L.map("print-map-container", {
    attributionControl: false,
    zoomControl: false,
    preferCanvas: true, // Gunakan canvas rendering untuk capture yang lebih baik
  }).setView(map.getCenter(), map.getZoom());

  // Base tile layer dengan crossOrigin untuk html2canvas
  const baseTileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "",
    crossOrigin: "anonymous" // Penting untuk html2canvas
  }).addTo(printMap);

  // Tunggu base tiles dimuat
  await new Promise(resolve => {
    baseTileLayer.on('load', resolve);
    setTimeout(resolve, 2000); // Fallback timeout
  });

  // Load HGU Layer
  try {
    const hguResponse = await fetch("data/HGU.geojson");
    const hguData = await hguResponse.json();
    L.geoJSON(hguData, {
      style: { color: "orange", weight: 4, fillOpacity: 0 }
    }).addTo(printMap);
  } catch (error) {
    console.log("HGU layer tidak dapat dimuat:", error);
  }

  // Load AFD Layer
  try {
    const afdResponse = await fetch("data/AFD.geojson");
    const afdData = await afdResponse.json();
    L.geoJSON(afdData, {
      style: { color: "black", weight: 2, fillOpacity: 0 }
    }).addTo(printMap);
  } catch (error) {
    console.log("AFD layer tidak dapat dimuat:", error);
  }

  // Load Blok Layer
  if (shpGeoJson) {
    const geojsonData = shpGeoJson.toGeoJSON();
    L.geoJSON(geojsonData, {
      style: function (feature) {
        const tkb = feature.properties.TKB;
        if (tkb === 0) return { fillColor: "#80B6D4", color: "gray", fillOpacity: 0.7, weight: 1 };
        else if (tkb <= 5) return { fillColor: "#7FFF00", color: "gray", fillOpacity: 0.7, weight: 1 };
        else if (tkb <= 10) return { fillColor: "#FFFF00", color: "gray", fillOpacity: 0.7, weight: 1 };
        else return { fillColor: "#e74c3c", color: "gray", fillOpacity: 0.7, weight: 1 };
      }
    }).addTo(printMap);
    printMap.fitBounds(L.geoJSON(geojsonData).getBounds());
  }

  // PENTING: Invalidate size dan tunggu render
  printMap.invalidateSize();
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Capture dengan pengaturan khusus untuk Leaflet
  html2canvas(document.getElementById("print-layout"), {
    useCORS: true,
    allowTaint: false,
    foreignObjectRendering: false, // Penting untuk Leaflet
    scale: 1,
    width: 1153, // Tambah 40px untuk margin
    height: 824,  // Tambah 40px untuk margin
    scrollX: 0,
    scrollY: 0,
    // Hitung posisi tengah
    x: (document.getElementById("print-layout").offsetWidth - 1153) / 2,
    y: (document.getElementById("print-layout").offsetHeight - 824) / 2,
    ignoreElements: function(element) {
      // Abaikan elemen yang bisa menyebabkan masalah
      return element.classList.contains('leaflet-control-container');
    },
    onclone: function(clonedDoc) {
      // Pastikan ukuran map container di clone sama
      const clonedContainer = clonedDoc.getElementById("print-map-container");
      if (clonedContainer) {
        clonedContainer.style.width = "1000px";
        clonedContainer.style.height = "700x";
      }
    },
  }).then((canvas) => {
    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    document.getElementById("preview-img").src = imgData;
    document.getElementById("preview-modal").style.display = "flex";

    // Sembunyikan print-layout setelah capture
    document.getElementById("print-layout").style.display = "none";

    document.getElementById("download-jpg").onclick = () => {
      const link = document.createElement("a");
      link.download = "Peta_EWS_KSD.jpg";
      link.href = imgData;
      link.click();
    };

    document.getElementById("download-pdf").onclick = () => {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const imgProps = pdf.getImageProperties(imgData);
      const ratio = Math.min(pdf.internal.pageSize.getWidth() / imgProps.width, pdf.internal.pageSize.getHeight() / imgProps.height);
      const width = imgProps.width * ratio;
      const height = imgProps.height * ratio;
      const x = (pdf.internal.pageSize.getWidth() - width) / 2;
      const y = (pdf.internal.pageSize.getHeight() - height) / 2;
      pdf.addImage(imgData, "JPEG", x, y, width, height);
      pdf.save("Peta_EWS_KSD.pdf");
    };
  }).catch(error => {
    console.error("Error capturing canvas:", error);
    alert("Gagal membuat preview. Silakan coba lagi.");
    document.getElementById("print-layout").style.display = "none";
  });
});

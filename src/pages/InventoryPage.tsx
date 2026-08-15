import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, Boxes, CalendarDays, ChevronDown, CircleDollarSign, PackagePlus, Plus, Search, ShoppingCart } from "lucide-react";
import { createProduct, getProducts, registerPurchase } from "../api";
import { Badge, statusTone } from "../components/Badge";
import { Button } from "../components/Button";
import { type Column, DataTable } from "../components/DataTable";
import { KpiCard } from "../components/KpiCard";
import { Modal } from "../components/Modal";
import type { Product } from "../types";

const tabs = ["Productos", "Compras", "Consumo", "Proveedores"];

export function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [tab, setTab] = useState("Productos");
  const [category, setCategory] = useState("Todas");
  const [branch, setBranch] = useState("Todas las sedes");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [newOpen, setNewOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  const load = () => { void getProducts().then(setProducts); };
  useEffect(load, []);
  const filtered = useMemo(() => products.filter((product) =>
    (category === "Todas" || product.category === category) &&
    (branch === "Todas las sedes" || product.branch === branch) &&
    (!query.trim() || product.name.toLowerCase().includes(query.toLowerCase()))
  ), [products, category, branch, query]);
  const pageRows = filtered.slice((page - 1) * 5, page * 5);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 5));

  const submitProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const saved = await createProduct({
      name: String(form.get("name")), category: String(form.get("category")), branch: String(form.get("branch")), stock: Number(form.get("stock")), minimum: Number(form.get("minimum")), unit: String(form.get("unit")),
    });
    setProducts((current) => [saved, ...current]); setPage(1); setNewOpen(false);
  };

  const submitPurchase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await registerPurchase(String(form.get("product")), Number(form.get("quantity")));
    load(); setPurchaseOpen(false);
  };

  const columns: Column<Product>[] = [
    { key: "name", header: "Producto", width: "22%", render: (product) => <span className="product-cell"><span className={`product-icon tone-bg--${product.tone}`}>{product.name.slice(0, 1)}</span><strong>{product.name}</strong></span> },
    { key: "category", header: "Categoría", width: "17%", render: (product) => product.category },
    { key: "branch", header: "Sede", render: (product) => product.branch },
    { key: "stock", header: "Stock actual", width: "22%", render: (product) => <div className="stock-cell"><span>{product.stock} {product.unit}</span><div className="stock-bar"><i className={`stock-bar--${statusTone(product.status)}`} style={{ width: `${Math.min(100, (product.stock / Math.max(product.minimum * 2, 1)) * 100)}%` }} /></div></div> },
    { key: "minimum", header: "Stock mínimo", render: (product) => product.minimum },
    { key: "status", header: "Estado", render: (product) => <Badge tone={statusTone(product.status)}>{product.status}</Badge> },
    { key: "updated", header: "Último movimiento", render: (product) => product.updated },
    { key: "more", header: "", render: () => <button className="row-menu" aria-label="Más acciones">⋮</button> },
  ];

  return (
    <section className="page">
      <div className="page-heading"><h1>Gestión de inventario</h1><p>Control de insumos y materiales por sede</p></div>
      <div className="section-tabs">{tabs.map((label) => <button key={label} className={tab === label ? "section-tab--active" : ""} onClick={() => setTab(label)}>{label}</button>)}</div>
      <div className="kpi-grid">
        <KpiCard icon={Boxes} value={128} label="Productos registrados" tone="blue" />
        <KpiCard icon={AlertTriangle} value={7} label="Stock bajo" tone="amber" />
        <KpiCard icon={CalendarDays} value={3} label="Por vencer" tone="red" />
        <KpiCard icon={CircleDollarSign} value="S/ 24,850" label="Valor del inventario" tone="green" />
      </div>

      {tab === "Productos" ? <>
        <div className="inventory-toolbar">
          <label className="select-control"><select aria-label="Tipo"><option>Tipo: Todos</option><option>Insumos</option><option>Materiales</option></select><ChevronDown size={16} /></label>
          <label className="select-control"><select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }} aria-label="Categoría"><option value="Todas">Categoría: Todas</option><option>Insumos</option><option>Material restaurador</option><option>Medicamentos</option><option>Bioseguridad</option></select><ChevronDown size={16} /></label>
          <label className="select-control"><select value={branch} onChange={(event) => { setBranch(event.target.value); setPage(1); }} aria-label="Sede"><option>Todas las sedes</option><option>Lince</option><option>Jesús María</option><option>Magdalena</option></select><ChevronDown size={16} /></label>
          <label className="search-control"><Search size={19} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Buscar producto o código" aria-label="Buscar producto" /></label>
          <Button icon={ShoppingCart} onClick={() => setPurchaseOpen(true)}>Registrar compra</Button>
          <Button variant="primary" icon={Plus} onClick={() => setNewOpen(true)}>Nuevo producto</Button>
        </div>
        <div className="inventory-alert"><span><AlertTriangle size={20} />7 productos necesitan reposición</span><button onClick={() => { setCategory("Todas"); setQuery(""); }}>Ver alertas</button></div>
        <section className="panel table-panel table-panel--flush"><DataTable columns={columns} rows={pageRows} rowKey={(product) => product.id} /><div className="pagination"><span>Mostrando {pageRows.length} de {filtered.length || 128} productos</span><div><button onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>‹</button>{Array.from({ length: pageCount }, (_, index) => <button key={index + 1} className={page === index + 1 ? "page-active" : ""} onClick={() => setPage(index + 1)}>{index + 1}</button>)}<button onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page === pageCount}>›</button></div><select aria-label="Filas por página"><option>25 por página</option></select></div></section>
      </> : <section className="panel contextual-empty"><PackagePlus /><h2>{tab}</h2><p>Consulta y registra la operación de inventario seleccionada.</p><Button variant="primary">Nuevo registro</Button></section>}

      <Modal title="Nuevo producto" open={newOpen} onClose={() => setNewOpen(false)}>
        <form className="form-grid" onSubmit={submitProduct}>
          <label className="field field--wide"><span>Nombre del producto</span><input name="name" required autoFocus /></label>
          <label className="field"><span>Categoría</span><select name="category"><option>Insumos</option><option>Material restaurador</option><option>Medicamentos</option><option>Bioseguridad</option></select></label>
          <label className="field"><span>Sede</span><select name="branch"><option>Todas las sedes</option><option>Lince</option><option>Jesús María</option><option>Magdalena</option></select></label>
          <label className="field"><span>Stock inicial</span><input name="stock" type="number" min="0" required /></label>
          <label className="field"><span>Stock mínimo</span><input name="minimum" type="number" min="0" required /></label>
          <label className="field field--wide"><span>Unidad de medida</span><input name="unit" placeholder="cajas, unidades, frascos…" required /></label>
          <div className="form-actions field--wide"><Button type="button" onClick={() => setNewOpen(false)}>Cancelar</Button><Button type="submit" variant="primary">Guardar producto</Button></div>
        </form>
      </Modal>
      <Modal title="Registrar compra" open={purchaseOpen} onClose={() => setPurchaseOpen(false)}>
        <form className="form-grid" onSubmit={submitPurchase}>
          <label className="field field--wide"><span>Producto</span><select name="product">{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
          <label className="field"><span>Cantidad recibida</span><input name="quantity" type="number" min="1" required /></label>
          <label className="field"><span>Proveedor</span><input name="provider" defaultValue="DentalPro Perú" required /></label>
          <div className="form-actions field--wide"><Button type="button" onClick={() => setPurchaseOpen(false)}>Cancelar</Button><Button type="submit" variant="primary">Registrar compra</Button></div>
        </form>
      </Modal>
    </section>
  );
}

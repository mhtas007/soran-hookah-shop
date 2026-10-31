import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAll';
import { Plus, TestTube, Package, Beaker, Trash2, ArrowRight } from 'lucide-react';
import type { Product, MixRecipe } from '../types';

export const Mixes = () => {
  const navigate = useNavigate();
  const [recipes, setRecipes] = useState<MixRecipe[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'recipes' | 'production' | 'history'>('recipes');

  // Load initial data
  const loadData = async () => {
    setLoading(true);
    try {
      const { data: prods } = await fetchAllRows<any>(() => supabase.from('products').select('*').order('name'));
      if (prods) setProducts(prods);

      const { data: recs } = await supabase
        .from('mix_recipes')
        .select(`
          *,
          ingredients:mix_recipe_ingredients(*)
        `)
        .order('created_at', { ascending: false });
      if (recs) setRecipes(recs);

    } catch (err) {
      console.error("Error loading mixes:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/')} 
            className="p-2.5 hover:bg-slate-200 text-slate-600 hover:text-slate-900 rounded-2xl transition-all active:scale-95 border border-slate-200/80 bg-white shadow-xs"
            title="گەڕانەوە بۆ داشبۆردی سەرەکی"
          >
            <ArrowRight className="w-5 h-5 text-slate-700" />
          </button>

          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Beaker className="w-6 h-6 text-indigo-600" />
              کارگەی خەلتەکان
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              دروستکردن و بەڕێوەبردنی خەلتەی دەرمان
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-slate-100 rounded-lg w-max">
        <button
          onClick={() => setActiveTab('recipes')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
            activeTab === 'recipes' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          ڕەچەتەکان
        </button>
        <button
          onClick={() => setActiveTab('production')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
            activeTab === 'production' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          بەرهەمهێنان
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
            activeTab === 'history' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          مێژوو و ڕاپۆرت
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        {loading ? (
          <div className="flex justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <>
            {activeTab === 'recipes' && <RecipesTab recipes={recipes} products={products} onReload={loadData} />}
            {activeTab === 'production' && <ProductionTab recipes={recipes} products={products} onReload={loadData} />}
            {activeTab === 'history' && <HistoryTab products={products} />}
          </>
        )}
      </div>
    </div>
  );
};

// --- Recipes Tab ---
const RecipesTab = ({ recipes, products, onReload }: any) => {
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [outputProductId, setOutputProductId] = useState('');
  const [expectedYield, setExpectedYield] = useState(1000);
  const [ingredients, setIngredients] = useState([{ productId: '', quantity: 1 }]);

  // We allow all products except WGT to be ingredients to be safe, but let users filter.
  // We'll build a custom searchable dropdown for ingredients.
  const outputProducts = products.filter((p: any) => p.barcode.startsWith('WGT-'));
  const ingredientProducts = products.filter((p: any) => !p.barcode.startsWith('WGT-'));

  const handleSave = async () => {
    if (!name || !outputProductId || ingredients.some(i => !i.productId || i.quantity <= 0)) {
      alert("تکایە زانیارییەکان بە دروستی پڕبکەرەوە");
      return;
    }

    try {
      const { data: newRecipe, error: recipeErr } = await supabase
        .from('mix_recipes')
        .insert([{ name, output_product_id: outputProductId, expected_yield: expectedYield }])
        .select()
        .single();
      
      if (recipeErr) throw recipeErr;

      const ingsToInsert = ingredients.map(ing => ({
        recipe_id: newRecipe.id,
        product_id: ing.productId,
        quantity: ing.quantity,
        unit: 'Piece'
      }));

      const { error: ingErr } = await supabase.from('mix_recipe_ingredients').insert(ingsToInsert);
      if (ingErr) throw ingErr;

      setShowModal(false);
      onReload();
    } catch (err: any) {
      alert("کێشەیەک ڕوویدا: " + err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('دڵنیایت لە سڕینەوەی ئەم ڕەچەتەیە؟')) return;
    try {
      await supabase.from('mix_recipes').delete().eq('id', id);
      onReload();
    } catch (err: any) {
      alert("کێشەیەک ڕوویدا: " + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-slate-800">ڕەچەتەکانی بەردەست</h2>
        <button 
          onClick={() => {
            setName(''); setOutputProductId(''); setExpectedYield(1000); setIngredients([{productId: '', quantity: 1}]);
            setShowModal(true);
          }}
          className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl hover:bg-indigo-700 transition-all shadow-md hover:shadow-lg font-medium"
        >
          <Plus className="w-5 h-5" />
          ڕەچەتەی نوێ
        </button>
      </div>

      {recipes.length === 0 ? (
        <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
          <Beaker className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          هیچ ڕەچەتەیەک بوونی نییە. کلیک لە دوگمەی سەرەوە بکە بۆ زیادکردن.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {recipes.map((recipe: any) => {
            const outProduct = products.find((p:any) => p.id === recipe.output_product_id);
            return (
              <div key={recipe.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all relative group overflow-hidden">
                <div className="absolute top-0 right-0 w-2 h-full bg-indigo-500"></div>
                <button onClick={() => handleDelete(recipe.id)} className="absolute top-4 left-4 text-rose-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity bg-rose-50 p-2 rounded-full">
                  <Trash2 className="w-4 h-4" />
                </button>
                <h3 className="font-bold text-xl text-slate-800 mb-2 pr-2">{recipe.name}</h3>
                <p className="text-sm text-slate-600 mb-5 flex items-center gap-2 bg-indigo-50/50 p-2 rounded-lg pr-2 border border-indigo-50/50">
                  <Package className="w-4 h-4 text-indigo-500" />
                  دەبێتە: <span className="font-bold text-indigo-700">{outProduct?.name || 'نەناسراو'}</span> 
                  <span className="text-xs bg-white px-2 py-1 rounded-md shadow-sm border border-slate-100 text-slate-500">{(recipe.expected_yield / 1000).toFixed(2)} کگم</span>
                </p>
                <div className="space-y-2 bg-slate-50/80 p-4 rounded-xl border border-slate-100 pr-2">
                  <h4 className="text-xs font-bold text-slate-500 mb-3 flex items-center gap-2">
                    <TestTube className="w-3.5 h-3.5" />
                    پێکهاتەکان (بە دانە):
                  </h4>
                  {(recipe.ingredients || []).map((ing: any) => {
                    const prod = products.find((p:any) => p.id === ing.product_id);
                    return (
                      <div key={ing.id} className="flex justify-between items-center text-sm border-b border-slate-200/60 pb-2 last:border-0 last:pb-0">
                        <span className="text-slate-700 font-medium">{prod?.name || 'سڕاوەتەوە'}</span>
                        <span className="font-bold bg-white shadow-sm px-2.5 py-1 rounded-md text-indigo-600 border border-slate-100">{ing.quantity}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
              <div className="bg-indigo-100 text-indigo-600 p-2.5 rounded-xl">
                <Beaker className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800">ڕەچەتەی نوێ دروست بکە</h2>
                <p className="text-xs text-slate-500 mt-1">تکایە زانیارییەکانی خەلتەکە و پێکهاتەکانی دیاری بکە</p>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="col-span-full">
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">ناوی ڕەچەتە</label>
                  <input type="text" placeholder="نموونە: خەلتەی بەنیشت VIP" value={name} onChange={e => setName(e.target.value)} className="w-full border-slate-200 rounded-xl p-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-50 transition-all bg-slate-50 focus:bg-white" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">دەبێتە کام کاڵا لە کۆگا؟</label>
                  <select value={outputProductId} onChange={e => setOutputProductId(e.target.value)} className="w-full border-slate-200 rounded-xl p-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-50 transition-all bg-slate-50 focus:bg-white">
                    <option value="">- هەڵبژێرە (WGT) -</option>
                    {outputProducts.map((p:any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">کێشی دروستبوو (گرام)</label>
                  <input type="number" value={expectedYield} onChange={e => setExpectedYield(Number(e.target.value))} className="w-full border-slate-200 rounded-xl p-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-50 transition-all bg-slate-50 focus:bg-white" />
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="font-bold text-slate-800">پێکهاتەکان (بە دانە)</h3>
                    <p className="text-xs text-slate-500">ئەو دەرمانانەی کە بەکاردێن بۆ دروستکردنی ئەم خەلتەیە</p>
                  </div>
                  <button onClick={() => setIngredients([...ingredients, {productId: '', quantity: 1}])} className="text-sm text-indigo-600 font-bold bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5">
                    <Plus className="w-4 h-4" />
                    زیادکردنی دانە
                  </button>
                </div>
                
                <div className="space-y-3">
                  {ingredients.map((ing, idx) => (
                    <div key={idx} className="flex gap-3 items-center bg-slate-50 p-3 rounded-2xl border border-slate-200/60 hover:border-indigo-200 transition-colors group">
                      <div className="flex-1">
                        <SearchableProductSelect 
                          products={ingredientProducts} 
                          value={ing.productId} 
                          onChange={(val: string) => {
                            const newIng = [...ingredients];
                            newIng[idx].productId = val;
                            setIngredients(newIng);
                          }} 
                        />
                      </div>
                      <div className="w-24">
                        <input type="number" min="1" value={ing.quantity} onChange={e => {
                          const newIng = [...ingredients];
                          newIng[idx].quantity = Number(e.target.value);
                          setIngredients(newIng);
                        }} className="w-full text-sm border-slate-200 rounded-xl p-2.5 text-center outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-50 font-bold" placeholder="چەند؟" />
                      </div>
                      <button onClick={() => {
                        const newIng = [...ingredients];
                        newIng.splice(idx, 1);
                        setIngredients(newIng);
                      }} className="text-rose-400 p-2.5 hover:bg-rose-100 hover:text-rose-600 rounded-xl transition-colors bg-white border border-slate-100 shadow-sm"><Trash2 className="w-5 h-5"/></button>
                    </div>
                  ))}
                  {ingredients.length === 0 && (
                    <div className="text-center py-6 text-slate-400 text-sm bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                      هیچ پێکهاتەیەک زیاد نەکراوە
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-100 flex gap-3 bg-slate-50/50 rounded-b-3xl">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-3 text-slate-600 bg-white border border-slate-200 rounded-xl font-bold hover:bg-slate-50 transition-colors shadow-sm">پاشگەزبوونەوە</button>
              <button onClick={handleSave} className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2">
                <Beaker className="w-5 h-5" />
                خەزنکردنی ڕەچەتە
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Custom Searchable Product Select ---
const SearchableProductSelect = ({ products, value, onChange }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [compFilter, setCompFilter] = useState('');

  // Extract unique categories and companies
  const categories = Array.from(new Set(products.map((p:any) => p.category).filter(Boolean)));
  const companies = Array.from(new Set(products.map((p:any) => p.company).filter(Boolean)));

  const filteredProducts = products.filter((p: any) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode.toLowerCase().includes(search.toLowerCase());
    const matchCat = catFilter ? p.category === catFilter : true;
    const matchComp = compFilter ? p.company === compFilter : true;
    return matchSearch && matchCat && matchComp;
  });

  const selectedProduct = products.find((p:any) => p.id === value);

  return (
    <div className="relative">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full border border-slate-200 bg-white rounded-xl p-2.5 text-sm cursor-pointer flex justify-between items-center outline-none hover:border-indigo-300 transition-colors"
      >
        <span className={selectedProduct ? "text-slate-800 font-medium" : "text-slate-400"}>
          {selectedProduct ? `${selectedProduct.name} (${selectedProduct.company || ''})` : 'دەرمانێک هەڵبژێرە...'}
        </span>
        <span className="text-slate-400 text-xs">▼</span>
      </div>

      {isOpen && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[300px]">
          <div className="p-2 bg-slate-50 border-b border-slate-100 space-y-2">
            <input 
              type="text" 
              placeholder="گەڕان بۆ دەرمان یان بارکۆد..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm outline-none focus:border-indigo-500"
              autoFocus
            />
            <div className="flex gap-2">
              <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="w-1/2 bg-white border border-slate-200 rounded-lg p-1.5 text-xs outline-none focus:border-indigo-500 text-slate-600">
                <option value="">گشت جۆرەکان</option>
                {categories.map((c:any) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={compFilter} onChange={e => setCompFilter(e.target.value)} className="w-1/2 bg-white border border-slate-200 rounded-lg p-1.5 text-xs outline-none focus:border-indigo-500 text-slate-600">
                <option value="">گشت شەریکەکان</option>
                {companies.map((c:any) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          
          <div className="overflow-y-auto flex-1">
            {filteredProducts.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-sm">هیچ دەرمانێک نەدۆزرایەوە</div>
            ) : (
              filteredProducts.map((p: any) => (
                <div 
                  key={p.id}
                  onClick={() => { onChange(p.id); setIsOpen(false); }}
                  className={`p-2.5 text-sm cursor-pointer border-b border-slate-50 last:border-0 hover:bg-indigo-50 flex justify-between items-center transition-colors ${value === p.id ? 'bg-indigo-50 font-bold text-indigo-700' : 'text-slate-700'}`}
                >
                  <div>
                    <div>{p.name}</div>
                    <div className="text-[10px] text-slate-400 flex gap-2">
                      <span>{p.category}</span>
                      {p.company && <span className="bg-slate-100 px-1 rounded">{p.company}</span>}
                    </div>
                  </div>
                  <div className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">{p.stockLevel} لە کۆگا</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// --- Production Tab ---
const ProductionTab = ({ recipes, products, onReload }: any) => {
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [yieldGrams, setYieldGrams] = useState(1000);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeIngredients, setActiveIngredients] = useState<any[]>([]);
  const [multiplier, setMultiplier] = useState(1);

  const selectedRecipe = recipes.find((r:any) => r.id === selectedRecipeId);

  useEffect(() => {
    if (selectedRecipe) {
      setYieldGrams(selectedRecipe.expected_yield);
      setActiveIngredients(selectedRecipe.ingredients.map((ing: any) => ({ ...ing })));
      setMultiplier(1);
    } else {
      setActiveIngredients([]);
      setMultiplier(1);
    }
  }, [selectedRecipe]);

  const handleMultiplierChange = (newMult: number) => {
    if (newMult <= 0 || !selectedRecipe) return;
    setMultiplier(newMult);
    setYieldGrams(selectedRecipe.expected_yield * newMult);
    setActiveIngredients(selectedRecipe.ingredients.map((ing: any) => ({
      ...ing,
      quantity: ing.quantity * newMult
    })));
  };

  const handleIngredientChange = (id: string, newQty: number) => {
    setActiveIngredients(prev => prev.map(ing => ing.id === id ? { ...ing, quantity: newQty } : ing));
  };

  const handleProduce = async () => {
    if (!selectedRecipe) return;
    if (yieldGrams <= 0) return alert("کێش ناتوانێت سفر بێت");
    if (!window.confirm(`دڵنیایت لە دروستکردنی ئەم خەلتەیە؟ ئەوە دەبێتە هۆی کەمبوونەوەی ستۆکی پێکهاتەکان.`)) return;

    setIsProcessing(true);
    try {
      let totalCost = 0;
      const batchIngredients = [];
      const { settings } = useAppStore.getState();
      const usdRate = settings?.usdRate || 154000;

      for (const ing of activeIngredients) {
        const prod = products.find((p:any) => p.id === ing.product_id);
        if (prod) {
          const cPrice = Number(prod.costPrice) || 0;
          const exchange = (prod.costCurrency || 'IQD') === 'USD' ? (usdRate / 100) : 1;
          const qty = Number(ing.quantity) || 0;
          const ingCost = (cPrice * exchange) * qty;
          
          totalCost += ingCost;
          batchIngredients.push({
            product_id: prod.id,
            quantity: qty,
            unit: ing.unit,
            cost_amount: ingCost,
            currentStock: prod.stockLevel
          });
        }
      }

      const { data: newBatch, error: batchErr } = await supabase
        .from('mix_batches')
        .insert([{
          recipe_id: selectedRecipe.id,
          output_product_id: selectedRecipe.output_product_id,
          yield_grams: yieldGrams,
          cost_amount: totalCost || 0
        }])
        .select()
        .single();
      
      if (batchErr) throw batchErr;

      const { error: ingErr } = await supabase
        .from('mix_batch_ingredients')
        .insert(batchIngredients.map(bi => ({
          batch_id: newBatch.id,
          product_id: bi.product_id,
          quantity: bi.quantity,
          unit: bi.unit,
          cost_amount: bi.cost_amount
        })));
      if (ingErr) throw ingErr;

      for (const bi of batchIngredients) {
        await supabase
          .from('products')
          .update({ stock_level: bi.currentStock - bi.quantity })
          .eq('id', bi.product_id);
      }

      const outProd = products.find((p:any) => p.id === selectedRecipe.output_product_id);
      if (outProd) {
        await supabase
          .from('products')
          .update({ stock_level: outProd.stockLevel + yieldGrams })
          .eq('id', outProd.id);
      }

      alert("خەلتەکە بە سەرکەوتوویی دروست کرا و ستۆک نوێ کرایەوە!");
      setSelectedRecipeId('');
      onReload();
    } catch (err: any) {
      alert("کێشەیەک ڕوویدا: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 text-indigo-800">
        <h3 className="font-bold flex items-center gap-2 mb-2">
          <TestTube className="w-5 h-5" />
          کارگەی بەرهەمهێنان
        </h3>
        <p className="text-sm">
          لێرە خەلتەکان دروست دەکەیت. دەتوانیت دەستکاری بڕی پێکهاتەکان بکەیت یان دوو هێندە و سێ هێندەیان بکەیت بەپێی پێویست.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">کام ڕەچەتەیە دروست دەکەیت؟</label>
          <select value={selectedRecipeId} onChange={e => setSelectedRecipeId(e.target.value)} className="w-full border-slate-300 rounded-xl p-3 text-lg bg-white shadow-sm outline-none focus:border-indigo-500">
            <option value="">- ڕەچەتەیەک هەڵبژێرە -</option>
            {recipes.map((r:any) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>

        {selectedRecipe && (
          <div className="animate-in fade-in slide-in-from-top-4 duration-300 space-y-4">
            <div className="flex items-center gap-3 bg-white p-3 border border-slate-200 rounded-xl shadow-sm">
              <span className="text-sm font-bold text-slate-700 whitespace-nowrap">چەند هێندە بکرێت؟</span>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {[1, 2, 3, 5, 10].map(m => (
                  <button 
                    key={m} 
                    onClick={() => handleMultiplierChange(m)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors shrink-0 ${multiplier === m ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    x{m}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between">
                <span className="font-bold text-slate-700">پێکهاتەی بەکارهاتوو</span>
                <span className="text-xs bg-rose-100 text-rose-700 px-2 py-1 rounded-full font-bold">دەتوانیت بڕەکەیان دەستکاری بکەیت</span>
              </div>
              <div className="p-4 space-y-3">
                {activeIngredients.map((ing:any) => {
                  const prod = products.find((p:any) => p.id === ing.product_id);
                  return (
                    <div key={ing.id} className="flex justify-between items-center border-b border-slate-100 pb-2 last:border-0 last:pb-0 gap-4">
                      <div className="flex items-center gap-2 flex-1">
                        <Package className="w-4 h-4 text-slate-400" />
                        <span className="font-medium text-slate-800 line-clamp-1">{prod?.name || 'نەناسراو'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input 
                          type="number" 
                          min="0"
                          value={ing.quantity} 
                          onChange={(e) => handleIngredientChange(ing.id, Number(e.target.value))}
                          className="w-20 border-slate-200 rounded-lg p-2 text-center font-bold text-rose-600 outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-200"
                        />
                        <span className="text-sm font-bold text-slate-500">دانە</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
              <div className="flex-1 w-full">
                <label className="block text-sm font-bold text-emerald-800 mb-1">بڕی دروستبوو بۆ فرۆشتن (بە گرام):</label>
                <div className="flex items-center gap-2 w-full">
                  <input type="number" value={yieldGrams} onChange={e => setYieldGrams(Number(e.target.value))} className="w-full sm:w-32 border-emerald-200 rounded-lg p-3 text-center font-bold text-lg outline-none focus:border-emerald-500" />
                  <span className="text-emerald-700 font-bold whitespace-nowrap">گرام (+ لە کۆگا)</span>
                </div>
              </div>
              <button 
                onClick={handleProduce}
                disabled={isProcessing}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3.5 rounded-xl font-bold text-lg shadow-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 shrink-0"
              >
                {isProcessing ? 'چاوەڕێ بە...' : 'بەرهەمهێنان'}
                {!isProcessing && <ArrowRight className="w-5 h-5" />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// --- History Tab ---
const HistoryTab = ({ products }: any) => {
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      const { data } = await supabase
        .from('mix_batches')
        .select(`
          *,
          recipe:mix_recipes(name),
          ingredients:mix_batch_ingredients(*)
        `)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (data) setBatches(data);
      setLoading(false);
    };
    fetchHistory();
  }, []);

  const ingredientTotals = batches.reduce((acc: any, batch: any) => {
    batch.ingredients.forEach((ing: any) => {
      if (!acc[ing.product_id]) acc[ing.product_id] = 0;
      acc[ing.product_id] += ing.quantity;
    });
    return acc;
  }, {});

  if (loading) return <div className="text-center py-8">چاوەڕێ بە...</div>;

  return (
    <div className="space-y-8">
      {/* Summary Section */}
      <div>
        <h3 className="font-bold text-slate-800 mb-4 text-lg">کۆی دەرمانە بەکارهاتووەکان لەم ماوەیەدا</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(ingredientTotals).map(([productId, qty]: any) => {
            const prod = products.find((p:any) => p.id === productId);
            return (
              <div key={productId} className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-center shadow-sm">
                <p className="text-sm text-slate-500 mb-1 line-clamp-1">{prod?.name || 'سڕاوەتەوە'}</p>
                <p className="text-2xl font-black text-rose-500">{qty} <span className="text-sm font-normal">دانە</span></p>
              </div>
            );
          })}
          {Object.keys(ingredientTotals).length === 0 && (
            <div className="col-span-full text-slate-400 text-center py-4">هیچ داتایەک نییە</div>
          )}
        </div>
      </div>

      {/* History Table */}
      <div>
        <h3 className="font-bold text-slate-800 mb-4 text-lg">مێژووی دروستکردنەکان</h3>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">بەروار</th>
                  <th className="px-4 py-3 font-semibold">ناوی ڕەچەتە</th>
                  <th className="px-4 py-3 font-semibold">بڕی دروستبوو</th>
                  <th className="px-4 py-3 font-semibold">تێچوو</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batches.map((batch: any) => (
                  <tr key={batch.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(batch.created_at).toLocaleString('en-US', {
                        year: 'numeric', month: 'numeric', day: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-800">{batch.recipe?.name || 'نەناسراو'}</td>
                    <td className="px-4 py-3 text-emerald-600 font-bold">{(batch.yield_grams / 1000).toFixed(2)} کگم</td>
                    <td className="px-4 py-3 text-slate-600">{batch.cost_amount.toLocaleString()} د.ع</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

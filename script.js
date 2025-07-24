const CURRENCY_SYMBOLS = {
  INR: "₹", USD: "$", EUR: "€", GBP: "£",
  JPY: "¥", CAD: "CA$", AUD: "A$", CNY: "¥",
  CHF: "CHF ", KRW: "₩"
};

const RECURRING_OPTIONS = {
  none: { label: "One-time", icon: "fa-times" },
  daily: { label: "Daily", icon: "fa-sun" },
  weekly: { label: "Weekly", icon: "fa-calendar-week" },
  monthly: { label: "Monthly", icon: "fa-calendar-alt" }
};

let state = {
  expenses: JSON.parse(localStorage.getItem('expenses')) || [],
  lockedCurrency: localStorage.getItem('lockedCurrency') || null,
  editingIndex: null,
  budgets: JSON.parse(localStorage.getItem('budgets')) || {
    total: null,
    categories: {}
  }
};

const el = {};
[
  "themeToggle", "expenseDate", "expense", "category", "customCategory",
  "customCategoryGroup", "note", "currency", "recurring", "addExpenseBtn", "resetCurrency",
  "budgetType", "budgetAmount", "setBudgetBtn", "totalBudgetDisplay",
  "totalBudgetLimit", "categoryBudgets", "expenseList", "filterPeriod",
  "search", "loader", "summary-today", "summary-week", "summary-month",
  "print-today", "print-week", "print-month", "print-table", "print-date"
].forEach(id => {
  el[id.replace(/-/g, "")] = document.getElementById(id);
  if (!el[id.replace(/-/g, "")]) console.warn(`Element #${id} not found in DOM`);
});

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing app');
  try {
    initTheme();
    initDatePicker();
    initCategorySelect();
    loadBudgets();
    updateUI();
    initEventListeners();
  } catch (error) {
    console.error('Initialization error:', error);
    showAlert('Failed to initialize app. Check console for details.', 'error');
  }
});

function initEventListeners() {
  console.log('Setting up event listeners');
  if (!el.addExpenseBtn) {
    console.error('addExpenseBtn not found');
    return;
  }
  el.addExpenseBtn.addEventListener('click', addExpense);
  el.addExpenseBtn.addEventListener('keydown', e => (e.key === 'Enter' || e.key === ' ') && addExpense());
  if (el.resetCurrency) el.resetCurrency.addEventListener('click', resetCurrency);
  if (el.filterPeriod) el.filterPeriod.addEventListener('change', updateUI);
  if (el.search) el.search.addEventListener('input', updateUI);
  if (el.setBudgetBtn) {
    el.setBudgetBtn.addEventListener('click', setBudget);
  } else {
    console.warn('setBudgetBtn not found');
  }
  el.exportButtons = document.querySelectorAll('.export-btn');
  el.exportButtons.forEach(btn => {
    if (btn.textContent.includes('PDF')) btn.addEventListener('click', exportToPDF);
    else if (btn.textContent.includes('Excel')) btn.addEventListener('click', exportToExcel);
    else if (btn.textContent.includes('Clear All')) btn.addEventListener('click', clearAllExpenses);
  });
}

function initTheme() {
  const dark = localStorage.getItem("theme") === "dark";
  document.body.classList.toggle("dark", dark);
  if (el.themeToggle) {
    el.themeToggle.textContent = dark ? "☀️" : "🌙";
    el.themeToggle.addEventListener("click", () => {
      const nowDark = document.body.classList.toggle("dark");
      localStorage.setItem("theme", nowDark ? "dark" : "light");
      el.themeToggle.textContent = nowDark ? "☀️" : "🌙";
    });
  }
}

function initDatePicker() {
  if (!el.expenseDate) return console.warn('expenseDate not found');
  const today = new Date().toISOString().split('T')[0];
  el.expenseDate.value = today;
  el.expenseDate.max = today;
}

function initCategorySelect() {
  if (!el.category) return console.warn('category not found');
  el.category.addEventListener("change", () => {
    el.customCategoryGroup.style.display = el.category.value === "" ? "block" : "none";
  });
}

function validateExpense() {
  try {
    const amountRaw = el.expense?.value;
    const amount = parseFloat(amountRaw);
    const category = el.category?.value || el.customCategory?.value || "Other";
    const currency = el.currency?.value;

    if (!el.expense || !el.category || !el.currency) {
      console.error('Missing input elements:', { expense: !!el.expense, category: !!el.category, currency: !!el.currency });
      showAlert('Required input fields are missing', 'error');
      return null;
    }

    if (!amountRaw || isNaN(amount) || amount <= 0) {
      showAlert(`Amount must be greater than 0. You entered: "${amountRaw}"`, "error");
      return null;
    }

    if (!category.trim()) {
      showAlert("Category is required", "error");
      return null;
    }

    if (!state.lockedCurrency) {
      state.lockedCurrency = currency;
      if (el.currency) el.currency.disabled = true;
      if (el.resetCurrency) el.resetCurrency.style.display = "block";
    } else if (currency !== state.lockedCurrency) {
      showAlert(`Currency mismatch. Locked to ${state.lockedCurrency}`, "error");
      return null;
    }

    return {
      id: Date.now().toString(),
      amount,
      category,
      note: el.note?.value.trim() || '',
      currency,
      date: el.expenseDate?.value || new Date().toISOString().split('T')[0],
      recurring: el.recurring?.value || 'none'
    };
  } catch (error) {
    console.error('Validation error:', error);
    showAlert('Error validating expense. Check console.', 'error');
    return null;
  }
}

function addExpense() {
  console.log('Attempting to add expense');
  if (!el.addExpenseBtn) return console.error('addExpenseBtn not found');
  showLoading(el.addExpenseBtn, true);
  const exp = validateExpense();
  if (!exp) {
    showLoading(el.addExpenseBtn, false);
    return;
  }

  try {
    if (state.editingIndex !== null) {
      state.expenses[state.editingIndex] = exp;
      state.editingIndex = null;
      showAlert('Expense updated successfully', 'success');
    } else {
      state.expenses.push(exp);
      addRecurringExpenses(exp);
      showAlert('Expense added successfully', 'success');
    }

    checkBudget(exp);
    saveState();
    updateUI();
    clearInputs();
  } catch (error) {
    console.error('Error adding expense:', error);
    showAlert('Failed to add expense. Check console.', 'error');
  } finally {
    showLoading(el.addExpenseBtn, false);
  }
}

function addRecurringExpenses(base) {
  if (base.recurring === 'none') return;
  try {
    let next = new Date(base.date);
    const end = new Date();
    switch (base.recurring) {
      case 'daily': end.setDate(end.getDate() + 30); break;
      case 'weekly': end.setDate(end.getDate() + 28); break;
      case 'monthly': end.setMonth(end.getMonth() + 3); break;
    }

    while (next < end) {
      next = new Date(next);
      switch (base.recurring) {
        case 'daily': next.setDate(next.getDate() + 1); break;
        case 'weekly': next.setDate(next.getDate() + 7); break;
        case 'monthly': next.setMonth(next.getMonth() + 1); break;
      }
      if (next.toISOString().split('T')[0] !== base.date) {
        state.expenses.push({ ...base, id: Date.now().toString(), date: next.toISOString().split('T')[0], isRecurring: true });
      }
    }
  } catch (error) {
    console.error('Error adding recurring expenses:', error);
    showAlert('Error with recurring expenses. Check console.', 'error');
  }
}

function editExpense(index) {
  try {
    const exp = state.expenses[index];
    if (!exp) return showAlert('Expense not found', 'error');
    if (exp.currency !== state.lockedCurrency) {
      showAlert(`Cannot edit: Currency locked to ${state.lockedCurrency}`, 'error');
      return;
    }
    el.expense.value = exp.amount;
    el.category.value = exp.category;
    el.note.value = exp.note || '';
    el.currency.value = exp.currency;
    el.expenseDate.value = exp.date;
    el.recurring.value = exp.recurring || 'none';
    state.editingIndex = index;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    el.expense.focus();
  } catch (error) {
    console.error('Error editing expense:', error);
    showAlert('Error editing expense. Check console.', 'error');
  }
}

function deleteExpense(index) {
  try {
    if (confirm('Delete this expense?')) {
      state.expenses.splice(index, 1);
      saveState();
      updateUI();
      showAlert('Expense deleted', 'success');
    }
  } catch (error) {
    console.error('Error deleting expense:', error);
    showAlert('Error deleting expense. Check console.', 'error');
  }
}

function clearAllExpenses() {
  try {
    if (!confirm("Are you sure you want to delete all expenses? This cannot be undone.")) return;
    state.expenses = [];
    state.editingIndex = null;
    saveState();
    updateUI();
    showAlert("All expenses have been cleared.", "success");
  } catch (error) {
    console.error('Error clearing expenses:', error);
    showAlert('Error clearing expenses. Check console.', 'error');
  }
}

function resetCurrency() {
  try {
    if (state.expenses.length > 0 && !confirm("Changing currency will clear all existing expenses. Continue?")) return;
    state.lockedCurrency = null;
    state.expenses = [];
    state.budgets = { total: null, categories: {} };
    saveState();
    if (el.currency) el.currency.disabled = false;
    if (el.resetCurrency) el.resetCurrency.style.display = 'none';
    updateUI();
    showAlert('Currency reset successfully', 'success');
  } catch (error) {
    console.error('Error resetting currency:', error);
    showAlert('Error resetting currency. Check console.', 'error');
  }
}

function setBudget() {
  try {
    if (!el.budgetType || !el.budgetAmount) return console.warn('budgetType or budgetAmount not found');
    const type = el.budgetType.value;
    const amount = parseFloat(el.budgetAmount.value);
    if (isNaN(amount) || amount <= 0) {
      showAlert('Budget amount must be greater than 0', 'error');
      return;
    }
    if (type === 'total') {
      state.budgets.total = amount;
    } else {
      state.budgets.categories[type] = amount;
    }
    saveState();
    loadBudgets();
    showAlert('Budget set successfully', 'success');
    el.budgetAmount.value = '';
  } catch (error) {
    console.error('Error setting budget:', error);
    showAlert('Error setting budget. Check console.', 'error');
  }
}

function checkBudget(exp) {
  try {
    const total = getTotalSpent();
    const catTotal = getSpentByCategory(exp.category);
    if (state.budgets.total && total > state.budgets.total)
      showAlert("You exceeded your total budget!", "warning");
    if (state.budgets.categories[exp.category] && catTotal > state.budgets.categories[exp.category])
      showAlert(`You exceeded budget for ${exp.category}`, "warning");
  } catch (error) {
    console.error('Error checking budget:', error);
  }
}

function loadBudgets() {
  try {
    if (!el.totalBudgetDisplay || !el.totalBudgetLimit || !el.categoryBudgets) return console.warn('totalBudgetDisplay, totalBudgetLimit, or categoryBudgets not found');
    el.totalBudgetLimit.textContent = state.budgets.total ? format(state.budgets.total) : "∞";
    renderCategoryBudgets();
  } catch (error) {
    console.error('Error loading budgets:', error);
    showAlert('Error loading budgets. Check console.', 'error');
  }
}

function renderCategoryBudgets() {
  try {
    if (!el.categoryBudgets) return console.warn('categoryBudgets not found');
    el.categoryBudgets.innerHTML = "";
    for (let [cat, limit] of Object.entries(state.budgets.categories)) {
      if (limit === null) continue;
      const spent = getSpentByCategory(cat);
      const percent = Math.min(100, (spent / limit) * 100);
      el.categoryBudgets.innerHTML += `
        <div class="category-budget">
          <div class="budget-info">
            <span>${cat}</span>
            <span>${format(spent)}/${format(limit)}</span>
          </div>
          <div class="budget-bar">
            <div class="budget-progress" style="width:${percent}%; background:${percent > 90 ? '#f44336' : percent > 75 ? '#ff9800' : '#4caf50'}"></div>
          </div>
        </div>`;
    }
  } catch (error) {
    console.error('Error rendering category budgets:', error);
    showAlert('Error rendering category budgets. Check console.', 'error');
  }
}

function updateUI() {
  console.log('Updating UI');
  try {
    renderExpenses();
    renderSummary();
    renderCategoryBudgets();
    const total = getTotalSpent();
    if (el.totalBudgetDisplay) {
      el.totalBudgetDisplay.textContent = format(total);
      if (state.budgets.total) {
        const percent = (total / state.budgets.total) * 100;
        el.totalBudgetDisplay.style.color = percent > 90 ? "#f44336" : percent > 75 ? "#ff9800" : "#4caf50";
      }
    }
  } catch (error) {
    console.error('Error updating UI:', error);
    showAlert('Error updating UI. Check console.', 'error');
  }
}

function renderExpenses() {
  try {
    if (!el.expenseList) return console.warn('expenseList not found');
    const expenses = filterExpenses();
    console.log('Rendering expenses:', expenses);
    el.expenseList.innerHTML = expenses.length === 0
      ? '<li>No expenses found for the selected period or search.</li>'
      : expenses.map((exp, i) => {
          const icon = el.category?.querySelector(`option[value="${exp.category}"]`)?.dataset.icon || "fa-tag";
          const recurringIcon = exp.recurring !== 'none' && !exp.isRecurring
            ? `<i class="fas ${RECURRING_OPTIONS[exp.recurring].icon}" title="Recurring: ${RECURRING_OPTIONS[exp.recurring].label}"></i>`
            : "";
          return `
            <li role="listitem">
              <div class="expense-icon"><i class="fas ${icon}"></i></div>
              <div class="expense-details">
                <span class="expense-amount">${format(exp.amount)}</span>
                <span class="expense-category">${exp.category}</span>
                ${exp.note ? `<span class="expense-note">${exp.note}</span>` : ''}
                <span class="expense-date">${formatDate(exp.date)}</span>
              </div>
              ${recurringIcon}
              <div class="action-buttons">
                <button class="edit-btn" onclick="editExpense(${i})" aria-label="Edit expense"><i class="fas fa-edit"></i></button>
                <button class="delete-btn" onclick="deleteExpense(${i})" aria-label="Delete expense"><i class="fas fa-trash"></i></button>
              </div>
            </li>`;
        }).join('');
  } catch (error) {
    console.error('Error rendering expenses:', error);
    showAlert('Error rendering expense history. Check console.', 'error');
  }
}

function renderSummary() {
  try {
    if (!el.summarytoday || !el.summaryweek || !el.summarymonth) return console.warn('Summary elements not found');
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const month = new Date().toISOString().slice(0, 7);

    const total = state.expenses.reduce((acc, e) => {
      if (e.currency !== state.lockedCurrency) return acc;
      if (e.date === today) acc.today += e.amount;
      if (new Date(e.date) >= weekAgo) acc.week += e.amount;
      if (e.date.startsWith(month)) acc.month += e.amount;
      return acc;
    }, { today: 0, week: 0, month: 0 });

    el.summarytoday.textContent = format(total.today);
    el.summaryweek.textContent = format(total.week);
    el.summarymonth.textContent = format(total.month);
    el.printtoday.textContent = format(total.today);
    el.printweek.textContent = format(total.week);
    el.printmonth.textContent = format(total.month);
  } catch (error) {
    console.error('Error rendering summary:', error);
    showAlert('Error rendering summary. Check console.', 'error');
  }
}

function preparePrintData() {
  try {
    if (!el.printtable) return console.warn('print-table not found');
    const tbody = el.printtable.querySelector('tbody');
    tbody.innerHTML = state.expenses.map(exp => `
      <tr>
        <td>${formatDate(exp.date)}</td>
        <td>${format(exp.amount)}</td>
        <td>${exp.category}</td>
        <td>${exp.note || '-'}</td>
        <td>${exp.recurring !== 'none' ? RECURRING_OPTIONS[exp.recurring].label : '-'}</td>
      </tr>
    `).join('');
    if (el.printdate) el.printdate.textContent = `Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    console.error('Error preparing print data:', error);
    showAlert('Error preparing print data. Check console.', 'error');
  }
}

async function exportToPDF() {
  try {
    showLoading(el.loader, true);
    preparePrintData();
    await new Promise(resolve => setTimeout(resolve, 300));
    window.print();
  } catch (error) {
    console.error('Error exporting to PDF:', error);
    showAlert('Error exporting to PDF. Check console.', 'error');
  } finally {
    showLoading(el.loader, false);
  }
}

async function exportToExcel() {
  try {
    showLoading(el.loader, true);
    if (typeof XLSX === 'undefined') {
      console.error('SheetJS not loaded');
      showAlert('Excel library failed to load. Check internet connection.', 'error');
      return;
    }
    const data = [
      ["Date", "Amount", "Currency", "Category", "Note", "Recurring"],
      ...state.expenses.map(exp => [
        formatDate(exp.date),
        exp.amount.toFixed(2),
        exp.currency,
        exp.category,
        exp.note || "",
        exp.recurring !== 'none' ? RECURRING_OPTIONS[exp.recurring].label : "One-time"
      ])
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Expenses");
    const summaryData = [
      ["Summary", ""],
      ["Total Expenses", state.expenses.length],
      ["Total Amount", getTotalSpent().toFixed(2)],
      ["", ""],
      ["Period", "Amount"],
      ["Today", getPeriodTotal('today').toFixed(2)],
      ["This Week", getPeriodTotal('week').toFixed(2)],
      ["This Month", getPeriodTotal('month').toFixed(2)]
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws2, "Summary");
    XLSX.writeFile(wb, `Expense_Report_${new Date().toISOString().slice(0,10)}.xlsx`);
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    showAlert('Error exporting to Excel. Check console.', 'error');
  } finally {
    showLoading(el.loader, false);
  }
}

function format(n) {
  return `${CURRENCY_SYMBOLS[state.lockedCurrency] || ""}${n.toFixed(2)}`;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString();
}

function getTotalSpent() {
  return state.expenses.reduce((sum, e) => e.currency === state.lockedCurrency ? sum + e.amount : sum, 0);
}

function getSpentByCategory(cat) {
  return state.expenses.reduce((sum, e) => e.category === cat && e.currency === state.lockedCurrency ? sum + e.amount : sum, 0);
}

function getPeriodTotal(period) {
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const month = new Date().toISOString().slice(0, 7);
  return state.expenses.reduce((sum, e) => {
    if (e.currency !== state.lockedCurrency) return sum;
    if (period === 'today' && e.date === today) return sum + e.amount;
    if (period === 'week' && new Date(e.date) >= weekAgo) return sum + e.amount;
    if (period === 'month' && e.date.startsWith(month)) return sum + e.amount;
    return sum;
  }, 0);
}

function filterExpenses() {
  try {
    if (!el.filterPeriod || !el.search) return console.warn('filterPeriod or search not found'), state.expenses;
    const f = el.filterPeriod.value;
    const q = el.search.value.toLowerCase();
    const now = new Date();
    return state.expenses.filter(e => {
      const matchDate =
        f === "all" ||
        (f === "today" && e.date === now.toISOString().split("T")[0]) ||
        (f === "week" && new Date(e.date) >= new Date(Date.now() - 7 * 86400000)) ||
        (f === "month" && e.date.startsWith(now.toISOString().slice(0, 7)));
      const matchSearch = !q || e.category.toLowerCase().includes(q) || (e.note && e.note.toLowerCase().includes(q));
      return matchDate && matchSearch;
    });
  } catch (error) {
    console.error('Error filtering expenses:', error);
    showAlert('Error filtering expenses. Check console.', 'error');
    return state.expenses;
  }
}

function saveState() {
  try {
    localStorage.setItem("expenses", JSON.stringify(state.expenses));
    localStorage.setItem("lockedCurrency", state.lockedCurrency);
    localStorage.setItem("budgets", JSON.stringify(state.budgets));
  } catch (error) {
    console.error('Error saving state:', error);
    showAlert('Error saving data. Check console.', 'error');
  }
}

function clearInputs() {
  try {
    if (el.expense) el.expense.value = "";
    if (el.note) el.note.value = "";
    if (el.category) el.category.value = "";
    if (el.customCategory) el.customCategory.value = "";
    if (el.recurring) el.recurring.value = "none";
    if (el.expenseDate) el.expenseDate.value = new Date().toISOString().split("T")[0];
  } catch (error) {
    console.error('Error clearing inputs:', error);
  }
}

function showLoading(element, show) {
  try {
    if (element === el.loader) {
      if (el.loader) el.loader.style.display = show ? 'block' : 'none';
    } else {
      const btnText = element.querySelector('.btn-text');
      const btnLoader = element.querySelector('.btn-loader');
      if (btnText && btnLoader) {
        btnText.style.display = show ? 'none' : 'block';
        btnLoader.style.display = show ? 'block' : 'none';
      }
      element.disabled = show;
    }
  } catch (error) {
    console.error('Error showing loading:', error);
  }
}

function showAlert(msg, type = "error") {
  try {
    const box = document.createElement("div");
    box.className = `alert ${type}`;
    box.setAttribute('role', 'alert');
    box.textContent = msg;
    document.body.appendChild(box);
    setTimeout(() => box.classList.add("fade-out"), 3000);
    setTimeout(() => box.remove(), 3500);
  } catch (error) {
    console.error('Error showing alert:', error);
  }
}
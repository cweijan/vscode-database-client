(function() {
    const vscode = acquireVsCodeApi();
    
    // 监听所有输入框的变更事件
    function bindInputEvents() {
        document.querySelectorAll('.variable-value').forEach(input => {
            input.addEventListener('change', (e) => {
                vscode.postMessage({
                    type: 'variableChanged',
                    name: e.target.dataset.name,
                    value: e.target.value
                });
            });
        });
    }

    // 初始绑定事件
    bindInputEvents();

    document.getElementById('closeBtn').addEventListener('click', () => {
        vscode.postMessage({ type: 'close' });
    });

    // 监听来自扩展的消息
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'syncVariable':
                const input = document.querySelector(`input[data-name="${message.name}"]`);
                if (input) {
                    input.value = message.value || '';
                }
                break;
            case 'updateAllVariables':
                const container = document.querySelector('.variables-list');
                container.innerHTML = message.variables.map(variable => `
                    <div class="variable-item">
                        <div class="variable-content">
                            <div class="variable-name">${variable.name}</div>
                            <input type="text" 
                                class="variable-value" 
                                value="${variable.value || ''}"
                                placeholder="Enter value"
                                data-name="${variable.name}">
                        </div>
                    </div>
                `).join('');
                // 重新绑定事件
                bindInputEvents();
                break;
        }
    });
})(); 
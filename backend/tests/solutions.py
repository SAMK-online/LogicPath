"""Independent optimal and brute-force solutions, used ONLY by tests to prove the performance fixtures do their job.

(They are written separately from the reference solutions in scripts/build_fixtures.py, so a passing run is a second
opinion on the expected outputs as well.) Nothing here is loaded by the app or shown to the tutor.
"""

OPTIMAL = {
    "even-or-odd": "def even_or_odd(n):\n    return 'Even' if n % 2 == 0 else 'Odd'\n",
    "reverse-string": "def reverse_string(s):\n    return s[::-1]\n",
    "palindrome-check": "def is_palindrome(s):\n    return s == s[::-1]\n",
    "find-maximum-element": "def find_max(nums):\n    best = nums[0]\n    for x in nums:\n        if x > best:\n            best = x\n    return best\n",
    "unique-in-order": "def unique_in_order(nums):\n    seen, out = set(), []\n    for x in nums:\n        if x not in seen:\n            seen.add(x)\n            out.append(x)\n    return out\n",
    "word-frequency": "def word_frequency(text):\n    counts = {}\n    for w in text.lower().split():\n        counts[w] = counts.get(w, 0) + 1\n    return counts\n",
    "prime-check": "def is_prime(n):\n    if n < 2:\n        return False\n    i = 2\n    while i * i <= n:\n        if n % i == 0:\n            return False\n        i += 1\n    return True\n",
    "two-sum": "def two_sum(nums, target):\n    seen = {}\n    for i, x in enumerate(nums):\n        if target - x in seen:\n            return [seen[target - x], i]\n        seen[x] = i\n",
    "contains-duplicate": "def contains_duplicate(nums):\n    return len(set(nums)) != len(nums)\n",
    "valid-anagram": "def is_anagram(s, t):\n    return sorted(s) == sorted(t)\n",
    "maximum-subarray": "def max_sub_array(nums):\n    best = cur = nums[0]\n    for x in nums[1:]:\n        cur = max(x, cur + x)\n        best = max(best, cur)\n    return best\n",
    "valid-palindrome": ("def is_palindrome(s):\n    i, j = 0, len(s) - 1\n    while i < j:\n        while i < j and not s[i].isalnum():\n            i += 1\n"
                         "        while i < j and not s[j].isalnum():\n            j -= 1\n        if s[i].lower() != s[j].lower():\n            return False\n        i += 1\n        j -= 1\n    return True\n"),
    "max-sum-subarray-size-k": "def max_sum_subarray(nums, k):\n    window = sum(nums[:k])\n    best = window\n    for i in range(k, len(nums)):\n        window += nums[i] - nums[i - k]\n        best = max(best, window)\n    return best\n",
    "valid-parentheses": ("def is_valid(s):\n    pairs = {')': '(', ']': '[', '}': '{'}\n    stack = []\n    for ch in s:\n        if ch in pairs:\n            if not stack or stack.pop() != pairs[ch]:\n                return False\n"
                          "        else:\n            stack.append(ch)\n    return not stack\n"),
    "binary-search": ("def search(nums, target):\n    lo, hi = 0, len(nums) - 1\n    while lo <= hi:\n        mid = (lo + hi) // 2\n        if nums[mid] == target:\n            return mid\n"
                      "        if nums[mid] < target:\n            lo = mid + 1\n        else:\n            hi = mid - 1\n    return -1\n"),
    "fibonacci-number": "def fib(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a\n",
    "maximum-depth-of-binary-tree": ("def max_depth(root):\n    if root is None:\n        return 0\n    depth, level = 0, [root]\n    while level:\n        depth += 1\n"
                                     "        level = [c for n in level for c in (n.left, n.right) if c]\n    return depth\n"),
    "invert-binary-tree": ("def invert_tree(root):\n    stack = [root] if root else []\n    while stack:\n        n = stack.pop()\n        n.left, n.right = n.right, n.left\n"
                           "        stack += [c for c in (n.left, n.right) if c]\n    return root\n"),
}

# What a student typically writes first: correct on small inputs, too slow (or too hungry) at the size the constraints allow.
BRUTE = {
    "even-or-odd": "def even_or_odd(n):\n    n = abs(n)\n    while n >= 2:\n        n -= 2\n    return 'Even' if n == 0 else 'Odd'\n",
    "reverse-string": "def reverse_string(s):\n    out = ''\n    for ch in s:\n        out = ch + out\n    return out\n",
    "palindrome-check": "def is_palindrome(s):\n    while len(s) > 1:\n        if s[0] != s[-1]:\n            return False\n        s = s[1:-1]\n    return True\n",
    "find-maximum-element": "def find_max(nums):\n    for x in nums:\n        if all(x >= y for y in nums):\n            return x\n",
    "unique-in-order": "def unique_in_order(nums):\n    out = []\n    for x in nums:\n        if x not in out:\n            out.append(x)\n    return out\n",
    "word-frequency": "def word_frequency(text):\n    words = text.lower().split()\n    return {w: words.count(w) for w in words}\n",
    "prime-check": "def is_prime(n):\n    if n < 2:\n        return False\n    for i in range(2, n):\n        if n % i == 0:\n            return False\n    return True\n",
    "two-sum": "def two_sum(nums, target):\n    for i in range(len(nums)):\n        for j in range(i + 1, len(nums)):\n            if nums[i] + nums[j] == target:\n                return [i, j]\n",
    "contains-duplicate": "def contains_duplicate(nums):\n    for i in range(len(nums)):\n        if nums[i] in nums[i + 1:]:\n            return True\n    return False\n",
    "valid-anagram": "def is_anagram(s, t):\n    if len(s) != len(t):\n        return False\n    for ch in s:\n        if s.count(ch) != t.count(ch):\n            return False\n    return True\n",
    "maximum-subarray": "def max_sub_array(nums):\n    best = nums[0]\n    for i in range(len(nums)):\n        total = 0\n        for j in range(i, len(nums)):\n            total += nums[j]\n            best = max(best, total)\n    return best\n",
    "valid-palindrome": "def is_palindrome(s):\n    c = [ch.lower() for ch in s if ch.isalnum()]\n    while len(c) > 1:\n        if c[0] != c[-1]:\n            return False\n        c = c[1:-1]\n    return True\n",
    "max-sum-subarray-size-k": "def max_sum_subarray(nums, k):\n    return max(sum(nums[i:i + k]) for i in range(len(nums) - k + 1))\n",
    "valid-parentheses": "def is_valid(s):\n    while '()' in s or '[]' in s or '{}' in s:\n        s = s.replace('()', '').replace('[]', '').replace('{}', '')\n    return s == ''\n",
    "binary-search": "def search(nums, target):\n    for i, x in enumerate(nums):\n        if x == target:\n            return i\n    return -1\n",
    "fibonacci-number": "def fib(n):\n    return n if n < 2 else fib(n - 1) + fib(n - 2)\n",
    "maximum-depth-of-binary-tree": "def max_depth(root):\n    if root is None:\n        return 0\n    return 1 + max(max_depth(root.left), max_depth(root.right))\n",
    "invert-binary-tree": "def invert_tree(root):\n    if root:\n        root.left, root.right = invert_tree(root.right), invert_tree(root.left)\n    return root\n",
}

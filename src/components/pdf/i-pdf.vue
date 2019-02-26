<template>
  <div
    class="wrapper"
    ref="wrapper"
    :style="wrapperStyle"
  >
    <div class="inner">
      <template v-for="(it,ix) in views">
        <div
          class="view"
          :key="ix"
          :ref="`view-${ix+1}`"
          :data-render="it.render.toString()"
          :data-page="ix+1"
          :style="it.difference?{height:it.height+'px',width:it.width+'px'}:viewStyle"
        >
          <canvas
            v-if="it.render"
            :ref="`canvas-${ix+1}`"
          ></canvas>
        </div>
      </template>

    </div>
  </div>
</template>

<script>
import PDFLib from 'pdfjs-dist'
import { getVisibleElements, throttleFrame } from '../../utils/pdf.js'
import IScroll from 'iscroll-zoom-probe'
// import BScroll from 'better-scroll'
// PDFLib.GlobalWorkerOptions.workerSrc = '/static/js/pdf.worker.0.min.js'
// const viewStatusMap = new Map()
// 在created生命周期中
// 目的是记录目标的渲染状态 并通过它对元素显示进行diff
// {
//   status: 0, 1, 2 // 1:渲染中,2:渲染完成
// }

export default {
  name: 'i-pdf',
  props: {
    width: 0,
    height: 0,
    isMobile: { // 是否为移动端
      type: Boolean,
      default: true
    },
    scrollOption: { // 滚动条options
      type: Object,
      default: () => {
        return {}
      }
    },
    options: {
      type: Object,
      default: () => {
        return {
        }
      }
    },
    url: ''
  },
  data () {
    return {
      pdf: {
        doc: null,
        width: 0, // 容器宽
        height: 0, // 容器高
        pageNums: 0, // 页码
        baseWidth: 0, // 页基础宽度
        baseHeight: 0, // 页基础高度
        scale: 1 // 缩放比例
      },
      pdfOptions: {
        CMAP_URL: '/static/cmaps/',
        CMAP_PACKED: true,
        workerSrc: 'https://cdn.bootcss.com/pdf.js/2.0.943/pdf.worker.min.js',
        threshold: 1500 // 上下超出部分
      },
      diff: {
        width: 0,
        height: 0
      },
      views: [],
      IScroll: null
    }
  },
  methods: {
    async init () {
      if (!this.url) return
      this.viewStatusMap.clear()
      Object.assign(this.$data, this.$options.data())
      const wrapper = this.$refs.wrapper
      await this.initDoc(this.url)
      await this.initViewport(wrapper)
      // wrapper.addEventListener('scroll', this._checkView)
      this.$emit('on-render', this.pdf.pageNums)
      await this.initScroll(wrapper)
      this.checkView()
    },
    // 初始化doc
    async initDoc (src) {
      const options = this.pdfOptions
      const doc = await PDFLib.getDocument({
        url: src,
        cMapUrl: options['CMAP_URL'],
        cMapPacked: options['CMAP_PACKED']
      })
      this.pdf.doc = doc
    },
    // 初始化视图,增加dom节点
    async initViewport (wrapper) {
      // const ch = wrapper.clientHeight
      const cw = wrapper.clientWidth
      const firstPage = await this.getPage(1)
      let scale = this.pdf.scale
      let viewport = firstPage.getViewport(scale)
      let bw = viewport.width
      let bh = viewport.height
      if (bw > cw) {
        scale = cw / bw
        this.pdf.scale = scale
        viewport = firstPage.getViewport(scale)
        bw = viewport.width
        bh = viewport.height
      }
      const pageNums = this.pdf.pageNums = this.pdf.doc.numPages
      this.pdf.baseWidth = bw
      this.pdf.baseHeight = bh
      this.pdf.width = bw
      this.pdf.height = bh * pageNums + ((pageNums - 1) * 2)
      const views = []
      for (let i = 1; i < pageNums + 1; i++) {
        views.push({
          render: false,
          div: () => this.$refs[`view-${i}`][0],
          canvas: () => this.$refs[`canvas-${i}`][0],
          id: i
        })
      }
      this.views = views
    },
    // 初始化滚动条和缩放
    async initScroll (wrapper) {
      return new Promise((resolve, reject) => {
        this.$nextTick(() => {
          const scroll = this.IScroll = new IScroll(wrapper, {
            zoom: true,
            scrollX: true,
            mouseWheel: true,
            scrollY: true,
            observeDOM: false,
            probeType: 2,
            ...this.scrollOption
          })
          scroll.on('scroll', this._checkView)
          resolve()
        })
      })
    },
    // 检查视图 更新显示节点
    async checkView () {
      this.$nextTick(async () => {
        const r = getVisibleElements(this.$refs.wrapper, this.IScroll, this.views, false, false, this.options.threshold)
        r.first && this.$emit('on-page', r.first.id)
        this.renderViews(r.views)
      })
    },
    // 批量添加渲染任务,并和上一次进行对比删除不显示的数据
    async renderViews (views) {
      const oldViews = new Set()
      // 遍历map映射表 查找出已经渲染的元素集合
      // 获取目前需要展示的元素集合
      // 根据现有元素从上列的old中删除
      // 剩下的就是需要删除,不需要显示的部分
      for (let k of this.viewStatusMap.keys()) {
        oldViews.add(k)
      }
      views.forEach(async item => {
        const pageNum = item.id
        oldViews.delete(pageNum)
        const page = await this.getPage(pageNum)
        this.render(page, pageNum)
      })
      for (let k of oldViews.keys()) {
        this.deleteView(k)
      }
    },
    // 删除节点
    async deleteView (pageNum) {
      const map = this.viewStatusMap.get(pageNum)
      if (!map) return
      // 查找取消渲染任务函数是否存在(如果存在则取消渲染)
      let task = map.task
      if (map.status === 1 && task && task.cancel && (task = task._internalRenderTask) && task.cancel) {
        task.cancel()
      }
      this.viewStatusMap.delete(pageNum) // 删除对应映射
      this.views[pageNum - 1]['render'] = false
    },
    async getPage (pageNum) {
      const doc = this.pdf.doc
      const page = await doc.getPage(pageNum)
      return page
    },
    // 渲染
    async render (IPage, pageNum) {
      let map = this.viewStatusMap.get(pageNum)
      if (map) {
        return
      } else {
        map = {
          status: 1
        }
        this.viewStatusMap.set(pageNum, map)
      }
      const view = this.views[pageNum - 1]
      view['render'] = true // 此时通知模版渲染出canvas
      this.$nextTick(async () => { // 等待canvas渲染完成
        const Ratio = window.devicePixelRatio
        let viewport = await IPage.getViewport(this.pdf.scale * Ratio)
        let bw = viewport.width
        let bh = viewport.height
        let rw = bw / Ratio
        let rh = bh / Ratio
        let canvas = this.views[pageNum - 1].canvas()
        if (!view['difference'] && (rh !== this.pdf.baseHeight || rw !== this.pdf.baseWidth)) {
          // 不一致情况
          view['difference'] = true
          if (this.isMobile && rw > this.pdf.baseWidth) {
            // 标识为移动端&&该文件宽度大于基础宽度
            // 初始化宽度并计算宽度缩放比例
            viewport = await IPage.getViewport(1)
            bw = viewport.width
            viewport = await IPage.getViewport(this.pdf.baseWidth / bw * Ratio)
            bw = viewport.width
            bh = viewport.height
            rw = bw / Ratio
            rh = bh / Ratio
          } else {
            // 小于或者不为移动端 正常显示 出现滚动条或者居中显示(比其他小)
            this.diff.width += rw - this.pdf.baseWidth
            this.diff.height += rh - this.pdf.baseHeight
          }
          view['height'] = rh
          view['width'] = rw
          this.$nextTick(() => {
            this.IScroll.refresh()
          })
        }
        // canvas设置为多倍的宽度
        // css中置顶canvas100% 避免移动端模糊问题
        canvas.width = bw
        canvas.height = bh
        const task = IPage.render({
          canvasContext: canvas.getContext('2d'),
          viewport: viewport
        })
        // 获取render-task 启动有中断渲染函数
        map.task = task
        task.promise.then(() => {
          map.status = 2
        }).catch(e => {
        })
      })
    }
  },
  computed: {
    innerStyle () {
      const { height, width } = this.pdf
      const diff = this.diff
      return `height:${height + diff.height}px;width:${width + diff.width}px;`
    },
    viewStyle () {
      const { baseWidth, baseHeight } = this.pdf
      return `height:${baseHeight}px;width:${baseWidth}px;`
    },
    wrapperStyle () {
      const { height, width } = this
      let o = {}
      if (height) {
        o['height'] = height + 'px'
      }
      if (width) {
        o['width'] = width + 'px'
      }
      return o
    }
  },
  components: {

  },
  beforeMount () {

  },
  watch: {
    url: {
      immediate: true,
      handler () {
        this.$nextTick(() => {
          this.init()
        })
      }
    }
  },
  mounted () {
  },
  created () {
    this.viewStatusMap = new Map()
    if (this.options) {
      const options = this.pdfOptions = { ...this.pdfOptions, ...this.options }
      Object.keys(options).forEach(key => {
        const value = options[key]
        switch (key) {
          case 'workerSrc':
            PDFLib.GlobalWorkerOptions.workerSrc = value
            break
          default:
            break
        }
      })
    }
    this._checkView = throttleFrame(this.checkView)
  }
}
</script>

<style lang="css" scoped>
.quickPDF {
  height: 100%;
}
.wrapper {
  height: 100%;
  width: 100%;
  background-color: #ddd;
  overflow: hidden;
  position: relative;
}
.inner {
  margin: auto;
}
.inner .view {
  background-color: #fff;
  margin: auto;
}
.view + .view {
  margin-top: 2px;
}
.inner .view canvas {
  width: 100%;
  height: 100%;
}
</style>
